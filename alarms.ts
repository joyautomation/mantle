import { nanoid } from "nanoid";
import { eq, and, between, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { Db } from "./db/db.ts";
import {
  alarmRules,
  alarmState,
  alarmHistory,
  type AlarmRuleRecord,
  type AlarmStateRecord,
} from "./db/schema.ts";
import {
  createErrorString,
  createFail,
  createSuccess,
  isSuccess,
  type Result,
} from "@joyautomation/dark-matter";
import { log } from "./log.ts";
import { pubsub } from "./pubsub.ts";
import { getMetricDescription } from "./metric-properties.ts";

// --- Types ---

export type AlarmRuleType = "true" | "false" | "above" | "below";
export type AlarmStateName =
  | "normal"
  | "pending"
  | "active"
  | "acknowledged";

export type AlarmTransition = {
  ruleId: string;
  ruleName: string;
  fromState: AlarmStateName;
  toState: AlarmStateName;
  metricPath: string;
  metricDescription: string | null;
  value: string | null;
  ruleType: AlarmRuleType;
  threshold: number | null;
  timestamp: string;
};

type CachedRule = AlarmRuleRecord & {
  metricKey: string;
};

// --- In-memory state ---

/** Map from metricKey (groupId|nodeId|deviceId|metricId) to rules targeting that metric */
const rulesByMetric = new Map<string, CachedRule[]>();

/** Map from ruleId to the pending delay timeout */
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Webhook configuration */
let webhookUrl: string | null = null;
let webhookSecret: string | null = null;
let spaceShortId: string | null = null;

// --- Helpers ---

function metricKey(
  groupId: string,
  nodeId: string,
  deviceId: string,
  metricId: string,
): string {
  return `${groupId}|${nodeId}|${deviceId}|${metricId}`;
}

function metricPath(
  groupId: string,
  nodeId: string,
  deviceId: string,
  metricId: string,
): string {
  return deviceId
    ? `${groupId}/${nodeId}/${deviceId}/${metricId}`
    : `${groupId}/${nodeId}/${metricId}`;
}

/**
 * Extract a numeric value from a metric update value.
 * Handles booleans (true=1, false=0), numbers, and string representations.
 */
function toNumeric(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return value;
  const n = Number(value);
  return isNaN(n) ? null : n;
}

/**
 * Check if the alarm condition is met for a given rule and value.
 */
function evaluateCondition(
  ruleType: AlarmRuleType,
  threshold: number | null,
  value: unknown,
): boolean {
  const num = toNumeric(value);
  if (num === null) return false;

  switch (ruleType) {
    case "true":
      return num !== 0;
    case "false":
      return num === 0;
    case "above":
      return threshold !== null && num > threshold;
    case "below":
      return threshold !== null && num < threshold;
    default:
      return false;
  }
}

// --- Webhook ---

async function sendWebhook(transition: AlarmTransition): Promise<void> {
  if (!webhookUrl) return;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (webhookSecret) {
      headers["X-Alarm-Webhook-Secret"] = webhookSecret;
    }

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        eventId: nanoid(),
        spaceShortId,
        transition: transition.toState === "active" ? "active" : "normal",
        ...transition,
      }),
    });

    if (!response.ok) {
      log.warn(
        `Alarm webhook returned ${response.status}: ${await response.text()}`,
      );
    }
  } catch (error) {
    log.warn(`Alarm webhook failed: ${createErrorString(error)}`);
  }
}

// --- State machine ---

async function transitionState(
  db: Db,
  rule: CachedRule,
  fromState: AlarmStateName,
  toState: AlarmStateName,
  value: string | null,
  now: Date,
): Promise<void> {
  // Update alarm_state
  const stateUpdate: Partial<AlarmStateRecord> = {
    state: toState,
    lastValue: value,
    updatedAt: now,
  };

  if (toState === "pending") {
    stateUpdate.conditionMetAt = now;
  } else if (toState === "active") {
    stateUpdate.activatedAt = now;
  } else if (toState === "normal") {
    stateUpdate.conditionMetAt = null;
    stateUpdate.activatedAt = null;
  }

  await db
    .update(alarmState)
    .set(stateUpdate)
    .where(eq(alarmState.ruleId, rule.id));

  // Write alarm_history
  await db.insert(alarmHistory).values({
    id: nanoid(),
    ruleId: rule.id,
    fromState,
    toState,
    value,
    timestamp: now,
  });

  const description = await getMetricDescription(
    db,
    rule.groupId,
    rule.nodeId,
    rule.deviceId,
    rule.metricId,
  );

  const transition: AlarmTransition = {
    ruleId: rule.id,
    ruleName: rule.name,
    fromState,
    toState,
    metricPath: metricPath(
      rule.groupId,
      rule.nodeId,
      rule.deviceId,
      rule.metricId,
    ),
    metricDescription: description,
    value,
    ruleType: rule.ruleType as AlarmRuleType,
    threshold: rule.threshold,
    timestamp: now.toISOString(),
  };

  // Publish for GraphQL subscription
  pubsub.publish("alarmStateChange", transition);

  // Fire webhook on activation or clearing
  if (toState === "active" || (toState === "normal" && fromState !== "normal")) {
    sendWebhook(transition);
  }

  log.info(
    `Alarm "${rule.name}" transitioned ${fromState} → ${toState} (value: ${value})`,
  );
}

/**
 * Schedule the pending→active transition after delay_sec expires.
 */
function schedulePendingTimer(
  db: Db,
  rule: CachedRule,
  delayMs: number,
  value: string | null,
): void {
  // Clear any existing timer
  const existing = pendingTimers.get(rule.id);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(async () => {
    pendingTimers.delete(rule.id);
    await transitionState(db, rule, "pending", "active", value, new Date());
  }, delayMs);

  pendingTimers.set(rule.id, timer);
}

function cancelPendingTimer(ruleId: string): void {
  const timer = pendingTimers.get(ruleId);
  if (timer) {
    clearTimeout(timer);
    pendingTimers.delete(ruleId);
  }
}

// --- Core evaluation ---

/**
 * Evaluate a single metric update against all matching alarm rules.
 * Called from the MQTT event handler in synapse.ts.
 */
export async function evaluateMetric(
  db: Db,
  groupId: string,
  nodeId: string,
  deviceId: string,
  metricId: string,
  value: unknown,
): Promise<void> {
  const key = metricKey(groupId, nodeId, deviceId, metricId);
  const rules = rulesByMetric.get(key);
  if (!rules || rules.length === 0) return;

  for (const rule of rules) {
    if (!rule.enabled) continue;

    try {
      // Get current state
      const stateRows = await db
        .select()
        .from(alarmState)
        .where(eq(alarmState.ruleId, rule.id));
      const currentState = stateRows[0];
      if (!currentState) continue;

      const state = currentState.state as AlarmStateName;
      const conditionMet = evaluateCondition(
        rule.ruleType as AlarmRuleType,
        rule.threshold,
        value,
      );
      const valueStr = String(value ?? "");
      const now = new Date();

      if (conditionMet) {
        // Condition is active
        switch (state) {
          case "normal":
            if (rule.delaySec > 0) {
              // Start delay timer
              await transitionState(
                db,
                rule,
                "normal",
                "pending",
                valueStr,
                now,
              );
              schedulePendingTimer(
                db,
                rule,
                rule.delaySec * 1000,
                valueStr,
              );
            } else {
              // Immediate activation
              await transitionState(
                db,
                rule,
                "normal",
                "active",
                valueStr,
                now,
              );
            }
            break;
          case "pending":
            // Still waiting — update last value but keep timer running
            await db
              .update(alarmState)
              .set({ lastValue: valueStr, updatedAt: now })
              .where(eq(alarmState.ruleId, rule.id));
            break;
          case "active":
          case "acknowledged":
            // Already alarmed — update last value
            await db
              .update(alarmState)
              .set({ lastValue: valueStr, updatedAt: now })
              .where(eq(alarmState.ruleId, rule.id));
            break;
        }
      } else {
        // Condition cleared
        switch (state) {
          case "pending":
            // Cancel timer, return to normal
            cancelPendingTimer(rule.id);
            await transitionState(
              db,
              rule,
              "pending",
              "normal",
              valueStr,
              now,
            );
            break;
          case "active":
          case "acknowledged":
            // Clear the alarm
            await transitionState(db, rule, state, "normal", valueStr, now);
            break;
          case "normal":
            // Already normal — nothing to do
            break;
        }
      }
    } catch (error) {
      log.warn(
        `Error evaluating alarm rule "${rule.name}": ${createErrorString(error)}`,
      );
    }
  }
}

// --- Rule cache management ---

function addRuleToCache(rule: AlarmRuleRecord): void {
  const key = metricKey(
    rule.groupId,
    rule.nodeId,
    rule.deviceId,
    rule.metricId,
  );
  const cached: CachedRule = { ...rule, metricKey: key };
  const existing = rulesByMetric.get(key) ?? [];
  // Replace if same ID exists, otherwise append
  const idx = existing.findIndex((r) => r.id === rule.id);
  if (idx >= 0) {
    existing[idx] = cached;
  } else {
    existing.push(cached);
  }
  rulesByMetric.set(key, existing);
}

function removeRuleFromCache(ruleId: string): void {
  for (const [key, rules] of rulesByMetric.entries()) {
    const filtered = rules.filter((r) => r.id !== ruleId);
    if (filtered.length === 0) {
      rulesByMetric.delete(key);
    } else {
      rulesByMetric.set(key, filtered);
    }
  }
  cancelPendingTimer(ruleId);
}

// --- CRUD operations ---

export async function createAlarmRule(
  db: Db,
  input: {
    groupId: string;
    nodeId: string;
    deviceId: string;
    metricId: string;
    name: string;
    ruleType: AlarmRuleType;
    threshold?: number | null;
    delaySec?: number;
    enabled?: boolean;
  },
): Promise<Result<AlarmRuleRecord>> {
  try {
    const id = nanoid();
    const now = new Date();
    const newRule = {
      id,
      groupId: input.groupId,
      nodeId: input.nodeId,
      deviceId: input.deviceId,
      metricId: input.metricId,
      name: input.name,
      ruleType: input.ruleType,
      threshold: input.threshold ?? null,
      delaySec: input.delaySec ?? 0,
      enabled: input.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(alarmRules).values(newRule);

    // Create initial state
    await db.insert(alarmState).values({
      ruleId: id,
      state: "normal",
      updatedAt: now,
    });

    addRuleToCache(newRule);
    return createSuccess(newRule);
  } catch (error) {
    return createFail(createErrorString(error));
  }
}

export async function updateAlarmRule(
  db: Db,
  id: string,
  input: {
    name?: string;
    ruleType?: AlarmRuleType;
    threshold?: number | null;
    delaySec?: number;
    enabled?: boolean;
  },
): Promise<Result<AlarmRuleRecord>> {
  try {
    const now = new Date();
    const updateData: Record<string, unknown> = { updatedAt: now };
    if (input.name !== undefined) updateData.name = input.name;
    if (input.ruleType !== undefined) updateData.ruleType = input.ruleType;
    if (input.threshold !== undefined) updateData.threshold = input.threshold;
    if (input.delaySec !== undefined) updateData.delaySec = input.delaySec;
    if (input.enabled !== undefined) updateData.enabled = input.enabled;

    await db
      .update(alarmRules)
      .set(updateData)
      .where(eq(alarmRules.id, id));

    const rows = await db
      .select()
      .from(alarmRules)
      .where(eq(alarmRules.id, id));
    if (rows.length === 0) {
      return createFail(`Alarm rule ${id} not found`);
    }

    const updated = rows[0];

    // If rule was disabled, cancel any pending timer and reset to normal
    if (input.enabled === false) {
      cancelPendingTimer(id);
      await db
        .update(alarmState)
        .set({
          state: "normal",
          conditionMetAt: null,
          activatedAt: null,
          updatedAt: now,
        })
        .where(eq(alarmState.ruleId, id));
    }

    // Update cache
    removeRuleFromCache(id);
    addRuleToCache(updated);

    return createSuccess(updated);
  } catch (error) {
    return createFail(createErrorString(error));
  }
}

export async function deleteAlarmRule(
  db: Db,
  id: string,
): Promise<Result<boolean>> {
  try {
    removeRuleFromCache(id);
    await db.delete(alarmRules).where(eq(alarmRules.id, id));
    return createSuccess(true);
  } catch (error) {
    return createFail(createErrorString(error));
  }
}

export async function acknowledgeAlarm(
  db: Db,
  ruleId: string,
): Promise<Result<AlarmStateRecord>> {
  try {
    const stateRows = await db
      .select()
      .from(alarmState)
      .where(eq(alarmState.ruleId, ruleId));
    if (stateRows.length === 0) {
      return createFail(`Alarm state for rule ${ruleId} not found`);
    }

    const current = stateRows[0];
    if (current.state !== "active") {
      return createFail(
        `Cannot acknowledge alarm in state "${current.state}" — must be "active"`,
      );
    }

    const now = new Date();
    await db
      .update(alarmState)
      .set({ state: "acknowledged", updatedAt: now })
      .where(eq(alarmState.ruleId, ruleId));

    // Get the rule for the transition record
    const ruleRows = await db
      .select()
      .from(alarmRules)
      .where(eq(alarmRules.id, ruleId));

    if (ruleRows.length > 0) {
      const rule = ruleRows[0];

      await db.insert(alarmHistory).values({
        id: nanoid(),
        ruleId,
        fromState: "active",
        toState: "acknowledged",
        value: current.lastValue,
        timestamp: now,
      });

      const description = await getMetricDescription(
        db,
        rule.groupId,
        rule.nodeId,
        rule.deviceId,
        rule.metricId,
      );

      pubsub.publish("alarmStateChange", {
        ruleId,
        ruleName: rule.name,
        fromState: "active",
        toState: "acknowledged",
        metricPath: metricPath(
          rule.groupId,
          rule.nodeId,
          rule.deviceId,
          rule.metricId,
        ),
        metricDescription: description,
        value: current.lastValue,
        ruleType: rule.ruleType as AlarmRuleType,
        threshold: rule.threshold,
        timestamp: now.toISOString(),
      } satisfies AlarmTransition);
    }

    const updatedRows = await db
      .select()
      .from(alarmState)
      .where(eq(alarmState.ruleId, ruleId));
    return createSuccess(updatedRows[0]);
  } catch (error) {
    return createFail(createErrorString(error));
  }
}

// --- Query helpers ---

export async function getAllAlarmRules(
  db: Db,
): Promise<Result<AlarmRuleRecord[]>> {
  try {
    const rows = await db.select().from(alarmRules);
    return createSuccess(rows);
  } catch (error) {
    return createFail(createErrorString(error));
  }
}

export async function getAllAlarmStates(
  db: Db,
): Promise<Result<(AlarmStateRecord & { rule: AlarmRuleRecord })[]>> {
  try {
    const rows = await db
      .select()
      .from(alarmState)
      .innerJoin(alarmRules, eq(alarmState.ruleId, alarmRules.id));
    return createSuccess(
      rows.map((r) => ({ ...r.alarm_state, rule: r.alarm_rules })),
    );
  } catch (error) {
    return createFail(createErrorString(error));
  }
}

export async function getAlarmHistory(
  db: Db,
  ruleId?: string,
  start?: Date,
  end?: Date,
): Promise<Result<typeof alarmHistory.$inferSelect[]>> {
  try {
    let query = db.select().from(alarmHistory);

    const conditions = [];
    if (ruleId) {
      conditions.push(eq(alarmHistory.ruleId, ruleId));
    }
    if (start && end) {
      conditions.push(between(alarmHistory.timestamp, start, end));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const rows = await query.orderBy(desc(alarmHistory.timestamp)).limit(1000);
    return createSuccess(rows);
  } catch (error) {
    return createFail(createErrorString(error));
  }
}

// --- Initialization ---

/**
 * Configure the webhook endpoint for alarm notifications.
 */
export function configureWebhook(url: string | null, secret: string | null, shortId: string | null): void {
  webhookUrl = url;
  webhookSecret = secret;
  spaceShortId = shortId;
  if (url) {
    log.info(`Alarm webhook configured: ${url}`);
  }
}

/**
 * Load all enabled alarm rules into the in-memory cache.
 * Restore pending timers from alarm_state for rules that were pending when the process stopped.
 */
export async function initializeAlarms(db: Db): Promise<Result<void>> {
  try {
    log.info("Initializing alarm engine...");

    // Load all rules
    const rules = await db.select().from(alarmRules);
    rulesByMetric.clear();

    for (const rule of rules) {
      addRuleToCache(rule);
    }

    log.info(`Loaded ${rules.length} alarm rule(s)`);

    // Restore pending timers
    const pendingStates = await db
      .select()
      .from(alarmState)
      .where(eq(alarmState.state, "pending"));

    for (const state of pendingStates) {
      const ruleRows = await db
        .select()
        .from(alarmRules)
        .where(eq(alarmRules.id, state.ruleId));
      if (ruleRows.length === 0 || !ruleRows[0].enabled) continue;

      const rule = ruleRows[0];
      const key = metricKey(
        rule.groupId,
        rule.nodeId,
        rule.deviceId,
        rule.metricId,
      );
      const cached: CachedRule = { ...rule, metricKey: key };

      if (state.conditionMetAt) {
        const elapsed = Date.now() - state.conditionMetAt.getTime();
        const totalDelay = rule.delaySec * 1000;
        const remaining = totalDelay - elapsed;

        if (remaining <= 0) {
          // Delay already expired while we were down — activate immediately
          await transitionState(
            db,
            cached,
            "pending",
            "active",
            state.lastValue,
            new Date(),
          );
        } else {
          // Resume the timer with remaining time
          schedulePendingTimer(db, cached, remaining, state.lastValue);
          log.info(
            `Restored pending timer for alarm "${rule.name}" (${Math.round(remaining / 1000)}s remaining)`,
          );
        }
      }
    }

    log.info("Alarm engine initialized");
    return createSuccess(undefined);
  } catch (error) {
    return createFail(createErrorString(error));
  }
}
