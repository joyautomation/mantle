import {
  bigint,
  boolean,
  index,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

// History Table
export const history = pgTable(
  "history",
  {
    groupId: text("group_id").notNull(),
    nodeId: text("node_id").notNull(),
    deviceId: text("device_id").default(""),
    metricId: text("metric_id").notNull(),
    intValue: bigint("int_value", { mode: "number" }),
    floatValue: real("float_value"),
    stringValue: text("string_value"),
    boolValue: boolean("bool_value"),
    timestamp: timestamp("timestamp", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    unq: unique().on(t.groupId, t.nodeId, t.deviceId, t.metricId, t.timestamp),
    idx_metric_time: index("idx_history_metric_time").on(
      t.groupId,
      t.nodeId,
      t.deviceId,
      t.metricId,
      t.timestamp,
    ),
  }),
);

export type HistoryRecord = typeof history.$inferSelect;

export const historyPropertiesTable = pgTable(
  "history_properties",
  {
    groupId: text("group_id").notNull(),
    nodeId: text("node_id").notNull(),
    deviceId: text("device_id").default(""),
    metricId: text("metric_id").notNull(),
    propertyId: text("property_id").notNull(),
    intValue: bigint("int_value", { mode: "number" }),
    floatValue: real("float_value"),
    stringValue: text("string_value"),
    boolValue: boolean("bool_value"),
    timestamp: timestamp("timestamp", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    unq: unique().on(
      t.groupId,
      t.nodeId,
      t.deviceId,
      t.metricId,
      t.propertyId,
      t.timestamp,
    ),
    idx_metric_time: index("idx_history_properties_metric_time").on(
      t.groupId,
      t.nodeId,
      t.deviceId,
      t.metricId,
      t.propertyId,
      t.timestamp,
    ),
  }),
);

export type HistoryPropertyRecord = typeof historyPropertiesTable.$inferSelect;

// Hidden Items Table - tracks items that should be filtered from queries
export const hiddenItems = pgTable(
  "hidden_items",
  {
    groupId: text("group_id").notNull(),
    nodeId: text("node_id").notNull(),
    deviceId: text("device_id").notNull().default(""),
    metricId: text("metric_id").notNull().default(""), // Empty string means entire node/device is hidden
    hiddenAt: timestamp("hidden_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.groupId, t.nodeId, t.deviceId, t.metricId] }),
  }),
);

export type HiddenItemRecord = typeof hiddenItems.$inferSelect;

// Alarm Rules Table - defines alarm conditions on individual metrics
export const alarmRules = pgTable(
  "alarm_rules",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id").notNull(),
    nodeId: text("node_id").notNull(),
    deviceId: text("device_id").notNull().default(""),
    metricId: text("metric_id").notNull(),
    name: text("name").notNull(),
    ruleType: text("rule_type").notNull(), // 'true', 'false', 'above', 'below'
    threshold: real("threshold"),
    delaySec: bigint("delay_sec", { mode: "number" }).notNull().default(0),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    idx_alarm_rules_metric: index("idx_alarm_rules_metric").on(
      t.groupId,
      t.nodeId,
      t.deviceId,
      t.metricId,
    ),
  }),
);

export type AlarmRuleRecord = typeof alarmRules.$inferSelect;

// Alarm State Table - tracks current state of each alarm rule
export const alarmState = pgTable("alarm_state", {
  ruleId: text("rule_id")
    .primaryKey()
    .references(() => alarmRules.id, { onDelete: "cascade" }),
  state: text("state").notNull().default("normal"), // 'normal', 'pending', 'active', 'acknowledged'
  conditionMetAt: timestamp("condition_met_at", { withTimezone: true }),
  activatedAt: timestamp("activated_at", { withTimezone: true }),
  lastNotifiedAt: timestamp("last_notified_at", { withTimezone: true }),
  lastValue: text("last_value"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type AlarmStateRecord = typeof alarmState.$inferSelect;

// Alarm History Table - audit log of all alarm state transitions
export const alarmHistory = pgTable(
  "alarm_history",
  {
    id: text("id").primaryKey(),
    ruleId: text("rule_id")
      .notNull()
      .references(() => alarmRules.id, { onDelete: "cascade" }),
    fromState: text("from_state").notNull(),
    toState: text("to_state").notNull(),
    value: text("value"),
    timestamp: timestamp("timestamp", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    idx_alarm_history_rule_time: index("idx_alarm_history_rule_time").on(
      t.ruleId,
      t.timestamp,
    ),
  }),
);

export type AlarmHistoryRecord = typeof alarmHistory.$inferSelect;
