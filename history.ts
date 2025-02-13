import type { SparkplugMetric, SparkplugTopic } from "@joyautomation/synapse";
import type { Db } from "./db/db.ts";
import { history } from "./db/schema.ts";
import type { HistoryRecord } from "./db/schema.ts";
import type {
  UMetric,
  UPayload,
} from "sparkplug-payload/lib/sparkplugbpayload.js";
import Long from "long";
import { log } from "./log.ts";
import { getBuilder } from "@joyautomation/conch";
import { and, avg, between, sql } from "drizzle-orm";
import { differenceInMinutes } from "date-fns";

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
        await db
          .insert(history)
          .values(record)
          .catch((error) => {
            log.error(error);
          });
      } else {
        log.warn(
          `Metric missing name or timestamp: name: ${metric.name}, timestamp: ${metric.timestamp}`
        );
      }
    }
  }
}

export async function getHistory(
  db: Db,
  metrics: string[],
  start: Date,
  end: Date,
  interval?: string,
  samples?: number,
  raw?: boolean
) {
  const autoInterval = `${Math.floor(
    (differenceInMinutes(new Date(end), new Date(start)) * 60.0) /
      (samples ?? 300.0)
  )} seconds`;
  const time =
    raw != null
      ? history.timestamp
      : sql`time_bucket('${interval ?? autoInterval}', "timestamp")`;
  const subQuery = await db
    .select({
      time,
      name: sql`CONCAT("groupId",'/',"nodeId",'/',"deviceId",'/',"metricId")`,
      value: sql`AVG("floatValue")`,
    })
    .from(history)
    .where(
      and(
        sql`("groupId", "nodeId", "deviceId", "metricId") in (${metrics.join(
          ", "
        )})`,
        between(history.timestamp, new Date(start), new Date(end))
      )
    );
  await db
    .select({
      time,
      data: sql<Record<string, unknown>>`json_object_agg("name","value")`,
    })
    .from(sql`(${subQuery}) as bucketed`)
    .groupBy(sql`time`);
}

export function addHistoryToSchema(builder: ReturnType<typeof getBuilder>) {
  const HistoryRecordRef = builder.objectRef<HistoryRecord>("HistoryRecord");

  HistoryRecordRef.implement({
    fields: (t) => ({
      groupId: t.exposeString("groupId"),
      nodeId: t.exposeString("nodeId"),
      deviceId: t.exposeString("deviceId"),
      metricId: t.exposeString("metricId"),
      timestamp: t.field({
        type: "Date",
        resolve: (parent) => parent.timestamp,
      }),
    }),
  });
}
