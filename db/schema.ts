import {
  boolean,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

// History Table
export const history = pgTable("history", {
  groupId: text("group_id").notNull(),
  nodeId: text("node_id").notNull(),
  deviceId: text("device_id").default(""),
  metricId: text("metric_id").notNull(),
  intValue: integer("int_value"),
  floatValue: real("float_value"),
  stringValue: text("string_value"),
  boolValue: boolean("bool_value"),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull()
    .defaultNow(),
}, (t) => ({
  unq: unique().on(t.groupId, t.nodeId, t.deviceId, t.metricId, t.timestamp),
}));

export type HistoryRecord = typeof history.$inferSelect;
