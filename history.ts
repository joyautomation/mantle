import type { SparkplugMetric, SparkplugTopic } from "@joyautomation/synapse";
import type { Db } from "./db/db.ts";
import {
  history as historyTable,
  historyPropertiesTable,
} from "./db/schema.ts";
import type { HistoryRecord } from "./db/schema.ts";
import type { UPayload } from "sparkplug-payload/lib/sparkplugbpayload.js";
import Long from "long";
import { log } from "./log.ts";
import type { getBuilder } from "@joyautomation/conch";
import { and, between, eq, sql } from "drizzle-orm";
import {
  createErrorString,
  createFail,
  createSuccess,
  isSuccess,
} from "@joyautomation/dark-matter";
import { GraphQLError } from "graphql";

/**
 * Determines the value type of a SparkplugMetric.
 * @param {SparkplugMetric} metric - The SparkplugMetric to analyze.
 * @returns {string} The determined value type as a string.
 */
export function getValueType(metric: SparkplugMetric) {
  if (
    metric.type.toLowerCase().startsWith("int") ||
    metric.type.toLowerCase().startsWith("uint")
  ) {
    return "intValue";
  } else if (
    metric.type.toLowerCase() === "float" ||
    metric.type.toLowerCase() === "double"
  ) {
    return "floatValue";
  } else if (metric.type.toLowerCase() === "boolean") {
    return "boolValue";
  } else {
    return "stringValue";
  }
}

/**
 * Calculates a timestamp from various input types, handling both seconds and milliseconds.
 * @param {number | UMetric["timestamp"] | null | undefined} timestamp - The input timestamp.
 * @returns {Date | null} The calculated Date object or null if input is invalid.
 */
export function calcTimestamp(
  timestamp?: Long.Long | number | null,
): Date | null {
  if (timestamp) {
    let timestampMs: number;
    if (typeof timestamp === "number") {
      // If timestamp is in seconds (less than 12 digits), convert to milliseconds
      timestampMs = timestamp < 1e12 ? timestamp * 1000 : timestamp;
      return new Date(timestampMs);
    } else if (Long.isLong(timestamp)) {
      timestampMs = timestamp.toNumber();
      // If timestamp is in seconds (less than 12 digits), convert to milliseconds
      timestampMs = timestampMs < 1e12 ? timestampMs * 1000 : timestampMs;
      return new Date(timestampMs);
    }
  }
  return null;
}

/**
 * Records metric values to the database.
 * @param {Db} db - The database instance.
 * @param {SparkplugTopic} topic - The SparkplugTopic object.
 * @param {UPayload} message - The UPayload object containing metrics.
 * @returns {Promise<void>}
 */
export async function recordValues(
  db: Db,
  topic: SparkplugTopic,
  message: UPayload,
) {
  const { metrics } = message;
  const { groupId, edgeNode: nodeId, deviceId } = topic;
  if (metrics) {
    for (const metric of metrics) {
      const timestamp = calcTimestamp(metric.timestamp || message.timestamp);
      const valueType = getValueType(metric);
      if (metric.name && timestamp) {
        log.debug(
          `Recording metric: ${metric.name} with value: ${metric.value}`,
        );
        const record: HistoryRecord = {
          groupId,
          nodeId,
          metricId: metric.name || "",
          deviceId: deviceId || "",
          timestamp,
          intValue: valueType === "intValue"
            ? Long.isLong(metric.value)
              ? metric.value.toNumber()
              : (metric.value as number)
            : null,
          floatValue: valueType === "floatValue"
            ? (metric.value as number)
            : null,
          stringValue: valueType === "stringValue" ? `${metric.value}` : null,
          boolValue: valueType === "boolValue"
            ? (metric.value as boolean)
            : null,
        };
        try {
          await db.insert(historyTable).values(record);
        } catch (error) {
          log.error(`Error recording metric: ${metric.name}`, error);
        }
      } else {
        log.warn(
          `Metric missing name or timestamp: name: ${metric.name}, timestamp: ${metric.timestamp}`,
        );
      }
    }
  }
}

type MetricHistory = {
  value: string | null;
  timestamp: Date;
};

type History = {
  groupId: string;
  nodeId: string;
  deviceId: string | null;
  metricId: string;
  history: MetricHistory[];
};

type HistoryMetricInput = {
  groupId: string;
  nodeId: string;
  deviceId: string | null;
  metricId: string;
};

type UsageMonth = {
  year: number;
  month: number;
  count: number;
};

type UsageStats = {
  totalCount: number;
  byMonth: UsageMonth[];
};

export async function getHistory({
  db,
  metrics,
  start,
  end,
  interval,
  samples,
  raw,
}: {
  metrics: HistoryMetricInput[];
  start: Date;
  end: Date;
  interval?: string | null;
  samples?: number | null;
  raw?: boolean | null;
  db: Db;
}) {
  try {
    const autoInterval = `${
      Math.max(1, Math.floor(
        (end.getTime() - start.getTime()) / (1000 * (samples ?? 100)),
      ))
    }s`;
    const time = raw === true
      ? sql<Date>`${historyTable.timestamp} as "time"`
      : sql<Date>`time_bucket(${
        interval ?? autoInterval
      }, "timestamp") as "time"`;
    const normalizedMetrics = metrics.map((metric) => ({
      groupId: String(metric.groupId),
      nodeId: String(metric.nodeId),
      deviceId: metric.deviceId ?? "",
      metricId: String(metric.metricId),
    }));
    // For raw mode, use COALESCE to get the first non-null value
    // For aggregated mode, use AVG for numeric types and cast bool to int for averaging
    const valueSelect = raw === true
      ? sql<number>`COALESCE("float_value", "int_value"::real, "bool_value"::int::real) as "value"`
      : sql<number>`COALESCE(AVG("float_value"), AVG("int_value"::real), AVG("bool_value"::int::real)) as "value"`;

    // Query for the most recent value BEFORE the start time for each metric (left edge)
    // This allows the chart to show what value existed at the start of the window
    const leftEdgeQuery = await db
      .select({
        name: sql<string>`CONCAT("group_id",'/',"node_id",'/',"device_id",'/',"metric_id") as "name"`,
        value: sql<number>`COALESCE("float_value", "int_value"::real, "bool_value"::int::real) as "value"`,
      })
      .from(historyTable)
      .where(
        sql.raw(
          `("group_id", "node_id", "device_id", "metric_id", "timestamp") in (
            SELECT "group_id", "node_id", "device_id", "metric_id", MAX("timestamp")
            FROM "history"
            WHERE ("group_id", "node_id", "device_id", "metric_id") in (${
              metrics
                .map(
                  (m) =>
                    `('${m.groupId}', '${m.nodeId}', '${m.deviceId}', '${m.metricId}')`,
                )
                .join(", ")
            })
            AND "timestamp" < '${start.toISOString()}'
            GROUP BY "group_id", "node_id", "device_id", "metric_id"
          )`,
        ),
      );

    // Build a map of left edge values by metric name
    const leftEdgeValues = new Map<string, number>();
    for (const row of leftEdgeQuery) {
      if (row.value !== null) {
        leftEdgeValues.set(row.name, row.value);
      }
    }

    const baseQuery = db
      .select({
        time,
        name: sql<
          string
        >`CONCAT("group_id",'/',"node_id",'/',"device_id",'/',"metric_id") as "name"`,
        value: valueSelect,
      })
      .from(historyTable)
      .where(
        and(
          sql.raw(
            `("group_id", "node_id", "device_id", "metric_id") in (${
              metrics
                .map(
                  (m) =>
                    `('${m.groupId}', '${m.nodeId}', '${m.deviceId}', '${m.metricId}')`,
                )
                .join(", ")
            })`,
          ),
          between(historyTable.timestamp, start, end),
        ),
      );
    const subQuery = raw === true
      ? baseQuery.orderBy(sql`time asc`)
      : baseQuery.groupBy(sql`time`, sql`name`).orderBy(sql`time asc`);
    const history = await db
      .select({
        time: sql<Date>`"time"`,
        data: sql<Record<string, string>>`json_object_agg("name","value")`,
      })
      .from(sql`${subQuery} as bucketed`)
      .groupBy(sql`time`);
    return createSuccess(
      normalizedMetrics.map((m) => {
        const metricKey = `${m.groupId}/${m.nodeId}/${m.deviceId}/${m.metricId}`;
        const metricHistory = history
          .map((h) => {
            return {
              timestamp: new Date(h.time),
              value: h.data[metricKey],
            };
          })
          .filter((h) => h.value !== null && h.value !== undefined);

        // Prepend left edge point if we have a value before the window
        // and the first data point isn't already at the start
        const leftEdgeValue = leftEdgeValues.get(metricKey);
        if (leftEdgeValue !== undefined) {
          const firstPoint = metricHistory[0];
          // Only add if there's no point at start or first point is after start
          if (!firstPoint || firstPoint.timestamp.getTime() > start.getTime()) {
            metricHistory.unshift({
              timestamp: start,
              value: String(leftEdgeValue),
            });
          }
        }

        return {
          ...m,
          history: metricHistory,
        };
      }),
    );
  } catch (error) {
    return createFail(createErrorString(error));
  }
}

export async function getUsage({ db }: { db: Db }) {
  try {
    // Use approximate_row_count for fast total (avoids full table scan)
    // Falls back to COUNT(*) if TimescaleDB function is not available
    let totalCount: number;
    try {
      const approxResult = await db.execute(
        sql`SELECT approximate_row_count('history') as count`,
      );
      totalCount = Number(approxResult.rows[0]?.count ?? 0);
    } catch {
      const countResult = await db
        .select({ count: sql<string>`COUNT(*)::text` })
        .from(historyTable);
      totalCount = parseInt(countResult[0]?.count || "0", 10);
    }

    // Get approximate count by month using chunk metadata (avoids full table scan).
    // Each chunk has a time range and pg_class.reltuples gives an O(1) row estimate.
    const byMonthResult = await db.execute(
      sql`SELECT
        EXTRACT(YEAR FROM range_start)::int as "year",
        EXTRACT(MONTH FROM range_start)::int as "month",
        SUM(approx)::text as "count"
      FROM (
        SELECT
          c.range_start,
          (SELECT reltuples::bigint FROM pg_class
           WHERE oid = format('%I.%I', c.chunk_schema, c.chunk_name)::regclass) as approx
        FROM timescaledb_information.chunks c
        WHERE c.hypertable_name = 'history'
      ) sub
      GROUP BY 1, 2
      ORDER BY 1 DESC, 2 DESC`,
    );

    const byMonth: UsageMonth[] = (byMonthResult.rows ?? []).map(
      (row: Record<string, unknown>) => ({
        year: Number(row.year),
        month: Number(row.month),
        count: parseInt(String(row.count), 10),
      }),
    );

    return createSuccess<UsageStats>({ totalCount, byMonth });
  } catch (error) {
    return createFail(createErrorString(error));
  }
}

/**
 * Delete all history for a node (including all devices and metrics)
 */
export async function deleteNodeHistory(
  db: Db,
  groupId: string,
  nodeId: string,
) {
  try {
    // Delete from history_properties first (referential integrity)
    await db.delete(historyPropertiesTable).where(
      and(
        eq(historyPropertiesTable.groupId, groupId),
        eq(historyPropertiesTable.nodeId, nodeId),
      ),
    );

    // Delete from history
    const result = await db.delete(historyTable).where(
      and(
        eq(historyTable.groupId, groupId),
        eq(historyTable.nodeId, nodeId),
      ),
    ).returning({ groupId: historyTable.groupId });

    log.info(`Deleted history for node: ${groupId}/${nodeId}, rows: ${result.length}`);
    return createSuccess({ deletedCount: result.length });
  } catch (error) {
    log.error(`Error deleting history for node: ${groupId}/${nodeId}`, error);
    return createFail(createErrorString(error));
  }
}

/**
 * Delete all history for a device (including all its metrics)
 */
export async function deleteDeviceHistory(
  db: Db,
  groupId: string,
  nodeId: string,
  deviceId: string,
) {
  try {
    // Delete from history_properties first
    await db.delete(historyPropertiesTable).where(
      and(
        eq(historyPropertiesTable.groupId, groupId),
        eq(historyPropertiesTable.nodeId, nodeId),
        eq(historyPropertiesTable.deviceId, deviceId),
      ),
    );

    // Delete from history
    const result = await db.delete(historyTable).where(
      and(
        eq(historyTable.groupId, groupId),
        eq(historyTable.nodeId, nodeId),
        eq(historyTable.deviceId, deviceId),
      ),
    ).returning({ groupId: historyTable.groupId });

    log.info(`Deleted history for device: ${groupId}/${nodeId}/${deviceId}, rows: ${result.length}`);
    return createSuccess({ deletedCount: result.length });
  } catch (error) {
    log.error(`Error deleting history for device: ${groupId}/${nodeId}/${deviceId}`, error);
    return createFail(createErrorString(error));
  }
}

/**
 * Delete all history for a specific metric
 */
export async function deleteMetricHistory(
  db: Db,
  groupId: string,
  nodeId: string,
  deviceId: string | null,
  metricId: string,
) {
  try {
    // Delete from history_properties first
    await db.delete(historyPropertiesTable).where(
      and(
        eq(historyPropertiesTable.groupId, groupId),
        eq(historyPropertiesTable.nodeId, nodeId),
        eq(historyPropertiesTable.deviceId, deviceId || ""),
        eq(historyPropertiesTable.metricId, metricId),
      ),
    );

    // Delete from history
    const result = await db.delete(historyTable).where(
      and(
        eq(historyTable.groupId, groupId),
        eq(historyTable.nodeId, nodeId),
        eq(historyTable.deviceId, deviceId || ""),
        eq(historyTable.metricId, metricId),
      ),
    ).returning({ groupId: historyTable.groupId });

    log.info(`Deleted history for metric: ${groupId}/${nodeId}/${deviceId || ""}/${metricId}, rows: ${result.length}`);
    return createSuccess({ deletedCount: result.length });
  } catch (error) {
    log.error(`Error deleting history for metric: ${groupId}/${nodeId}/${deviceId || ""}/${metricId}`, error);
    return createFail(createErrorString(error));
  }
}

export function addHistoryToSchema(
  builder: ReturnType<typeof getBuilder>,
  db: Db,
) {
  const MetricHistoryRef = builder.objectRef<MetricHistory>("MetricHistory");
  const HistoryRef = builder.objectRef<History>("History");
  MetricHistoryRef.implement({
    fields: (t) => ({
      value: t.exposeString("value"),
      timestamp: t.expose("timestamp", {
        type: "Date",
      }),
    }),
  });
  HistoryRef.implement({
    fields: (t) => ({
      groupId: t.exposeString("groupId"),
      nodeId: t.exposeString("nodeId"),
      deviceId: t.exposeString("deviceId"),
      metricId: t.exposeString("metricId"),
      history: t.field({
        type: [MetricHistoryRef],
        resolve: (parent) => parent.history,
      }),
    }),
  });
  const MetricHistoryInputRef = builder.inputType("MetricHistoryEntry", {
    fields: (t) => ({
      groupId: t.string({ required: true }),
      nodeId: t.string({ required: true }),
      deviceId: t.string({ required: true }),
      metricId: t.string({ required: true }),
    }),
  });
  builder.queryField("history", (t) =>
    t.field({
      type: [HistoryRef],
      args: {
        start: t.arg({
          type: "Date",
          required: true,
        }),
        end: t.arg({
          type: "Date",
          required: true,
        }),
        metrics: t.arg({
          type: [MetricHistoryInputRef],
          required: true,
        }),
        interval: t.arg.string(),
        samples: t.arg.int(),
        raw: t.arg.boolean({ defaultValue: false }),
      },
      resolve: async (_parent, args) => {
        const result = await getHistory({ ...args, db });
        if (isSuccess(result)) {
          return result.output;
        } else {
          throw new GraphQLError(result.error);
        }
      },
    }));

  // Usage statistics types and query
  const UsageMonthRef = builder.objectRef<UsageMonth>("UsageMonth");
  const UsageStatsRef = builder.objectRef<UsageStats>("UsageStats");

  UsageMonthRef.implement({
    fields: (t) => ({
      year: t.exposeInt("year"),
      month: t.exposeInt("month"),
      count: t.exposeInt("count"),
    }),
  });

  UsageStatsRef.implement({
    fields: (t) => ({
      totalCount: t.exposeInt("totalCount"),
      byMonth: t.field({
        type: [UsageMonthRef],
        resolve: (parent) => parent.byMonth,
      }),
    }),
  });

  builder.queryField("usage", (t) =>
    t.field({
      type: UsageStatsRef,
      resolve: async () => {
        const result = await getUsage({ db });
        if (isSuccess(result)) {
          return result.output;
        } else {
          throw new GraphQLError(result.error);
        }
      },
    }));
}
