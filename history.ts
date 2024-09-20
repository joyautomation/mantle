import type { SparkplugMetric, SparkplugTopic } from "@joyautomation/neuron";
import type { getDb } from "./db/db.ts";
import { history } from "./db/schema.ts";
import type { HistoryRecord } from "./db/schema.ts";
import type {
  UMetric,
  UPayload,
} from "sparkplug-payload/lib/sparkplugbpayload.js";
import Long from "long";
import { log } from "./log.ts";

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

export function calcTimestamp(
  timestamp: number | UMetric["timestamp"] | null | undefined,
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

export async function recordValues(
  db: Awaited<ReturnType<typeof getDb>>,
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
          deviceId: deviceId || null,
          timestamp,
          intValue: valueType === "intValue" ? metric.value as number : null,
          floatValue: valueType === "floatValue"
            ? metric.value as number
            : null,
          stringValue: valueType === "stringValue" ? `${metric.value}` : null,
          boolValue: valueType === "boolValue" ? metric.value as boolean : null,
        };
        await db.insert(history).values(record);
      } else {
        log.warn(
          `Metric missing name or timestamp: name: ${metric.name}, timestamp: ${metric.timestamp}`,
        );
      }
    }
  }
}
