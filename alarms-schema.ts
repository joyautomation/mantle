import type { getBuilder } from "@joyautomation/conch";
import type { Db } from "./db/db.ts";
import { GraphQLError } from "graphql";
import { isSuccess } from "@joyautomation/dark-matter";
import { pubsub } from "./pubsub.ts";
import {
  type AlarmRuleType,
  type AlarmStateName,
  type AlarmTransition,
  createAlarmRule,
  updateAlarmRule,
  deleteAlarmRule,
  acknowledgeAlarm,
  getAllAlarmRules,
  getAllAlarmStates,
  getAlarmHistory,
} from "./alarms.ts";
import type {
  AlarmRuleRecord,
  AlarmStateRecord,
  AlarmHistoryRecord,
} from "./db/schema.ts";
import { getMetricDescription } from "./metric-properties.ts";

/**
 * Add alarm-related types, queries, mutations, and subscriptions to the GraphQL schema.
 */
export function addAlarmsToSchema(
  builder: ReturnType<typeof getBuilder>,
  db: Db,
) {
  // --- Object types ---

  const AlarmRuleRef = builder.objectRef<AlarmRuleRecord>("AlarmRule");
  AlarmRuleRef.implement({
    fields: (t) => ({
      id: t.exposeString("id"),
      groupId: t.exposeString("groupId"),
      nodeId: t.exposeString("nodeId"),
      deviceId: t.exposeString("deviceId"),
      metricId: t.exposeString("metricId"),
      name: t.exposeString("name"),
      ruleType: t.exposeString("ruleType"),
      threshold: t.exposeFloat("threshold", { nullable: true }),
      delaySec: t.exposeInt("delaySec"),
      enabled: t.exposeBoolean("enabled"),
      createdAt: t.field({
        type: "String",
        resolve: (parent) => parent.createdAt.toISOString(),
      }),
      updatedAt: t.field({
        type: "String",
        resolve: (parent) => parent.updatedAt.toISOString(),
      }),
    }),
  });

  const AlarmStateRef = builder.objectRef<
    AlarmStateRecord & { rule: AlarmRuleRecord }
  >("AlarmState");
  AlarmStateRef.implement({
    fields: (t) => ({
      ruleId: t.exposeString("ruleId"),
      state: t.exposeString("state"),
      conditionMetAt: t.field({
        type: "String",
        nullable: true,
        resolve: (parent) => parent.conditionMetAt?.toISOString() ?? null,
      }),
      activatedAt: t.field({
        type: "String",
        nullable: true,
        resolve: (parent) => parent.activatedAt?.toISOString() ?? null,
      }),
      lastNotifiedAt: t.field({
        type: "String",
        nullable: true,
        resolve: (parent) => parent.lastNotifiedAt?.toISOString() ?? null,
      }),
      lastValue: t.exposeString("lastValue", { nullable: true }),
      updatedAt: t.field({
        type: "String",
        resolve: (parent) => parent.updatedAt.toISOString(),
      }),
      rule: t.field({
        type: AlarmRuleRef,
        resolve: (parent) => parent.rule,
      }),
      metricDescription: t.field({
        type: "String",
        nullable: true,
        resolve: async (parent) => {
          return getMetricDescription(
            db,
            parent.rule.groupId,
            parent.rule.nodeId,
            parent.rule.deviceId,
            parent.rule.metricId,
          );
        },
      }),
    }),
  });

  const AlarmHistoryRef = builder.objectRef<AlarmHistoryRecord>(
    "AlarmHistoryEntry",
  );
  AlarmHistoryRef.implement({
    fields: (t) => ({
      id: t.exposeString("id"),
      ruleId: t.exposeString("ruleId"),
      fromState: t.exposeString("fromState"),
      toState: t.exposeString("toState"),
      value: t.exposeString("value", { nullable: true }),
      timestamp: t.field({
        type: "String",
        resolve: (parent) => parent.timestamp.toISOString(),
      }),
    }),
  });

  const AlarmStateChangeRef =
    builder.objectRef<AlarmTransition>("AlarmStateChange");
  AlarmStateChangeRef.implement({
    fields: (t) => ({
      ruleId: t.exposeString("ruleId"),
      ruleName: t.exposeString("ruleName"),
      fromState: t.exposeString("fromState"),
      toState: t.exposeString("toState"),
      metricPath: t.exposeString("metricPath"),
      metricDescription: t.exposeString("metricDescription", { nullable: true }),
      value: t.exposeString("value", { nullable: true }),
      ruleType: t.exposeString("ruleType"),
      threshold: t.exposeFloat("threshold", { nullable: true }),
      timestamp: t.exposeString("timestamp"),
    }),
  });

  // --- Input types ---

  const AlarmRuleInput = builder.inputType("AlarmRuleInput", {
    fields: (t) => ({
      groupId: t.string({ required: true }),
      nodeId: t.string({ required: true }),
      deviceId: t.string({ required: false, defaultValue: "" }),
      metricId: t.string({ required: true }),
      name: t.string({ required: true }),
      ruleType: t.string({ required: true }),
      threshold: t.float({ required: false }),
      delaySec: t.int({ required: false, defaultValue: 0 }),
      enabled: t.boolean({ required: false, defaultValue: true }),
    }),
  });

  const AlarmRuleUpdateInput = builder.inputType("AlarmRuleUpdateInput", {
    fields: (t) => ({
      name: t.string({ required: false }),
      ruleType: t.string({ required: false }),
      threshold: t.float({ required: false }),
      delaySec: t.int({ required: false }),
      enabled: t.boolean({ required: false }),
    }),
  });

  // --- Queries ---

  builder.queryField("alarmRules", (t) =>
    t.field({
      type: [AlarmRuleRef],
      description: "Get all alarm rules",
      resolve: async () => {
        const result = await getAllAlarmRules(db);
        if (isSuccess(result)) return result.output;
        throw new GraphQLError(result.error);
      },
    }),
  );

  builder.queryField("alarmStates", (t) =>
    t.field({
      type: [AlarmStateRef],
      description: "Get current state of all alarms",
      resolve: async () => {
        const result = await getAllAlarmStates(db);
        if (isSuccess(result)) return result.output;
        throw new GraphQLError(result.error);
      },
    }),
  );

  builder.queryField("alarmHistory", (t) =>
    t.field({
      type: [AlarmHistoryRef],
      description: "Get alarm history entries",
      args: {
        ruleId: t.arg.string({ required: false }),
        start: t.arg({ type: "Date", required: false }),
        end: t.arg({ type: "Date", required: false }),
      },
      resolve: async (_parent, args) => {
        const result = await getAlarmHistory(
          db,
          args.ruleId ?? undefined,
          args.start ? new Date(args.start as unknown as string) : undefined,
          args.end ? new Date(args.end as unknown as string) : undefined,
        );
        if (isSuccess(result)) return result.output;
        throw new GraphQLError(result.error);
      },
    }),
  );

  // --- Mutations ---

  builder.mutationField("createAlarmRule", (t) =>
    t.field({
      type: AlarmRuleRef,
      description: "Create a new alarm rule",
      args: {
        input: t.arg({ type: AlarmRuleInput, required: true }),
      },
      resolve: async (_parent, args) => {
        const result = await createAlarmRule(db, {
          groupId: args.input.groupId,
          nodeId: args.input.nodeId,
          deviceId: args.input.deviceId ?? "",
          metricId: args.input.metricId,
          name: args.input.name,
          ruleType: args.input.ruleType as AlarmRuleType,
          threshold: args.input.threshold,
          delaySec: args.input.delaySec ?? 0,
          enabled: args.input.enabled ?? true,
        });
        if (isSuccess(result)) return result.output;
        throw new GraphQLError(result.error);
      },
    }),
  );

  builder.mutationField("updateAlarmRule", (t) =>
    t.field({
      type: AlarmRuleRef,
      description: "Update an existing alarm rule",
      args: {
        id: t.arg.string({ required: true }),
        input: t.arg({ type: AlarmRuleUpdateInput, required: true }),
      },
      resolve: async (_parent, args) => {
        const input: Record<string, unknown> = {};
        if (args.input.name != null) input.name = args.input.name;
        if (args.input.ruleType != null)
          input.ruleType = args.input.ruleType as AlarmRuleType;
        if (args.input.threshold !== undefined)
          input.threshold = args.input.threshold;
        if (args.input.delaySec != null) input.delaySec = args.input.delaySec;
        if (args.input.enabled != null) input.enabled = args.input.enabled;

        const result = await updateAlarmRule(db, args.id, input);
        if (isSuccess(result)) return result.output;
        throw new GraphQLError(result.error);
      },
    }),
  );

  builder.mutationField("deleteAlarmRule", (t) =>
    t.field({
      type: "Boolean",
      description: "Delete an alarm rule",
      args: {
        id: t.arg.string({ required: true }),
      },
      resolve: async (_parent, args) => {
        const result = await deleteAlarmRule(db, args.id);
        if (isSuccess(result)) return result.output;
        throw new GraphQLError(result.error);
      },
    }),
  );

  builder.mutationField("acknowledgeAlarm", (t) =>
    t.field({
      type: AlarmStateRef,
      description: "Acknowledge an active alarm",
      args: {
        ruleId: t.arg.string({ required: true }),
      },
      resolve: async (_parent, args) => {
        const result = await acknowledgeAlarm(db, args.ruleId);
        if (isSuccess(result)) {
          // Wrap with rule for the AlarmState type
          // Re-query to get the joined result
          const statesResult = await getAllAlarmStates(db);
          if (isSuccess(statesResult)) {
            const found = statesResult.output.find(
              (s) => s.ruleId === args.ruleId,
            );
            if (found) return found;
          }
          throw new GraphQLError("Alarm acknowledged but could not fetch updated state");
        }
        throw new GraphQLError(result.error);
      },
    }),
  );

  // --- Subscriptions ---

  builder.subscriptionField("alarmStateChange", (t) =>
    t.field({
      type: AlarmStateChangeRef,
      description: "Subscribe to alarm state transitions",
      subscribe: () => pubsub.subscribe("alarmStateChange"),
      resolve: (payload) => payload,
    }),
  );
}
