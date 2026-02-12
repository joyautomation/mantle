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
