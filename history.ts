import type { SparkplugMetric, SparkplugTopic } from "@joyautomation/synapse";
import type { Db } from "./db/db.ts";
import { history as historyTable } from "./db/schema.ts";
import type { HistoryRecord } from "./db/schema.ts";
import type {
  UMetric,
  UPayload,
} from "sparkplug-payload/lib/sparkplugbpayload.js";
import Long from "long";
import { log } from "./log.ts";
import type { getBuilder } from "@joyautomation/conch";
import { and, between, sql } from "drizzle-orm";
import {
  createFail,
  createSuccess,
  isSuccess,
  createErrorString,
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
 * Calculates a timestamp from various input types.
 * @param {number | UMetric["timestamp"] | null | undefined} timestamp - The input timestamp.
 * @returns {Date | null} The calculated Date object or null if input is invalid.
 */
export function calcTimestamp(
  timestamp: number | UMetric["timestamp"] | null | undefined
): Date | null {
  if (timestamp) {
    if (typeof timestamp === "number") {
      return new Date(timestamp * 1000);
    } else if (Long.isLong(timestamp)) {
      return new Date(timestamp.toNumber() * 1000);
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
  message: UPayload
) {
  const { metrics } = message;
  const { groupId, edgeNode: nodeId, deviceId } = topic;
  if (metrics) {
    for (const metric of metrics) {
      const timestamp = calcTimestamp(metric.timestamp || message.timestamp);
      const valueType = getValueType(metric);
      if (metric.name && timestamp) {
        log.debug(
          `Recording metric: ${metric.name} with value: ${metric.value}`
        );
        const record: HistoryRecord = {
          groupId,
          nodeId,
          metricId: metric.name || "",
          deviceId: deviceId || null,
          timestamp,
          intValue: valueType === "intValue" ? (metric.value as number) : null,
          floatValue:
            valueType === "floatValue" ? (metric.value as number) : null,
          stringValue: valueType === "stringValue" ? `${metric.value}` : null,
          boolValue:
            valueType === "boolValue" ? (metric.value as boolean) : null,
        };
        try {
          await db.insert(historyTable).values(record);
        } catch (error) {
          log.error(error);
        }
      } else {
        log.warn(
          `Metric missing name or timestamp: name: ${metric.name}, timestamp: ${metric.timestamp}`
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
    const autoInterval = `${Math.floor(
      (end.getTime() - start.getTime()) / (1000 * (samples ?? 100))
    )}s`;
    const time =
      raw == null
        ? sql<Date>`${historyTable.timestamp} as "time"`
        : sql<Date>`time_bucket(${
            interval ?? autoInterval
          }, "timestamp") as "time"`;
    const normalizedMetrics = metrics.map((metric) => ({
      groupId: String(metric.groupId),
      nodeId: String(metric.nodeId),
      deviceId: metric.deviceId ? String(metric.deviceId) : null,
      metricId: String(metric.metricId),
    }));
    const subQuery = db
      .select({
        time,
        name: sql<string>`CONCAT("group_id",'/',"node_id",'/',"device_id",'/',"metric_id") as "name"`,
        value: sql<number>`AVG("float_value") as "value"`,
      })
      .from(historyTable)
      .where(
        and(
          sql.raw(
            `("group_id", "node_id", "device_id", "metric_id") in (${metrics
              .map(
                (m) =>
                  `('${m.groupId}', '${m.nodeId}', '${m.deviceId}', '${m.metricId}')`
              )
              .join(", ")})`
          ),
          between(historyTable.timestamp, start, end)
        )
      )
      .groupBy(sql`time`, sql`name`)
      .orderBy(sql`time asc`);
    const history = await db
      .select({
        time: sql<Date>`"time"`,
        data: sql<Record<string, string>>`json_object_agg("name","value")`,
      })
      .from(sql`${subQuery} as bucketed`)
      .groupBy(sql`time`);
    return createSuccess(
      normalizedMetrics.map((m) => {
        return {
          ...m,
          history: history
            .map((h) => {
              return {
                timestamp: new Date(h.time),
                value:
                  h.data[
                    `${m.groupId}/${m.nodeId}/${m.deviceId}/${m.metricId}`
                  ],
              };
            })
            .filter((h) => h.value !== null && h.value !== undefined),
        };
      })
    );
  } catch (error) {
    return createFail(createErrorString(error));
  }
}

export function addHistoryToSchema(
  builder: ReturnType<typeof getBuilder>,
  db: Db
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
    })
  );
}
