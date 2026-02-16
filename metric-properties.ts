import type { Db } from "./db/db.ts";
import { metricProperties } from "./db/schema.ts";
import { and, eq, sql } from "drizzle-orm";
import {
  createErrorString,
  createFail,
  createSuccess,
  type Result,
} from "@joyautomation/dark-matter";
import { log } from "./log.ts";
import type { UMetric, UPropertyValue } from "sparkplug-payload/lib/sparkplugbpayload.js";
import Long from "long";

// TypeScript type for a single property entry in the JSONB
export type MetricPropertyEntry = {
  value: string | number | boolean | null;
  type: string;
  updatedAt: string;
};

export type MetricPropertiesJson = Record<string, MetricPropertyEntry>;

/**
 * Convert a Sparkplug UPropertyValue to a serializable entry.
 */
function propertyValueToEntry(propValue: UPropertyValue): MetricPropertyEntry {
  let value: string | number | boolean | null = null;
  if (Long.isLong(propValue.value)) {
    value = propValue.value.toNumber();
  } else if (propValue.value === null || propValue.value === undefined) {
    value = null;
  } else if (typeof propValue.value === "object") {
    // PropertySet or PropertySetList — stringify for storage
    value = JSON.stringify(propValue.value);
  } else {
    value = propValue.value as string | number | boolean;
  }
  return {
    value,
    type: propValue.type,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Extract properties from a UMetric and convert to JSONB-ready format.
 * Returns null if the metric has no properties.
 */
export function extractProperties(metric: UMetric): MetricPropertiesJson | null {
  if (!metric.properties || Object.keys(metric.properties).length === 0) {
    return null;
  }
  const result: MetricPropertiesJson = {};
  for (const [key, propValue] of Object.entries(metric.properties)) {
    result[key] = propertyValueToEntry(propValue);
  }
  return result;
}

/**
 * Upsert metric properties with JSONB merge.
 * Existing keys are preserved; incoming keys overwrite old values.
 * Uses PostgreSQL's || operator for shallow merge.
 */
export async function upsertMetricProperties(
  db: Db,
  groupId: string,
  nodeId: string,
  deviceId: string,
  metricId: string,
  newProperties: MetricPropertiesJson,
): Promise<Result<boolean>> {
  try {
    await db
      .insert(metricProperties)
      .values({
        groupId,
        nodeId,
        deviceId,
        metricId,
        properties: newProperties,
      })
      .onConflictDoUpdate({
        target: [
          metricProperties.groupId,
          metricProperties.nodeId,
          metricProperties.deviceId,
          metricProperties.metricId,
        ],
        set: {
          properties: sql`${metricProperties.properties} || ${JSON.stringify(newProperties)}::jsonb`,
        },
      });
    return createSuccess(true);
  } catch (error) {
    log.error(
      `Error upserting metric properties: ${groupId}/${nodeId}/${deviceId}/${metricId}`,
      error,
    );
    return createFail(createErrorString(error));
  }
}

/**
 * Get the description property value for a specific metric.
 * Returns the description string or null if not set.
 */
export async function getMetricDescription(
  db: Db,
  groupId: string,
  nodeId: string,
  deviceId: string,
  metricId: string,
): Promise<string | null> {
  try {
    const rows = await db
      .select({ properties: metricProperties.properties })
      .from(metricProperties)
      .where(
        and(
          eq(metricProperties.groupId, groupId),
          eq(metricProperties.nodeId, nodeId),
          eq(metricProperties.deviceId, deviceId),
          eq(metricProperties.metricId, metricId),
        ),
      );
    if (rows.length === 0) return null;
    const props = rows[0].properties as MetricPropertiesJson;
    return props?.description?.value?.toString() ?? null;
  } catch (error) {
    log.error(`Error getting metric description`, error);
    return null;
  }
}

/**
 * Get all metric properties for a specific metric.
 */
export async function getMetricProperties(
  db: Db,
  groupId: string,
  nodeId: string,
  deviceId: string,
  metricId: string,
): Promise<Result<MetricPropertiesJson>> {
  try {
    const rows = await db
      .select({ properties: metricProperties.properties })
      .from(metricProperties)
      .where(
        and(
          eq(metricProperties.groupId, groupId),
          eq(metricProperties.nodeId, nodeId),
          eq(metricProperties.deviceId, deviceId),
          eq(metricProperties.metricId, metricId),
        ),
      );
    if (rows.length === 0) return createSuccess({} as MetricPropertiesJson);
    return createSuccess(rows[0].properties as MetricPropertiesJson);
  } catch (error) {
    return createFail(createErrorString(error));
  }
}

// --- Cleanup functions for delete operations ---

export async function deleteMetricPropertiesForNode(
  db: Db,
  groupId: string,
  nodeId: string,
) {
  try {
    await db.delete(metricProperties).where(
      and(
        eq(metricProperties.groupId, groupId),
        eq(metricProperties.nodeId, nodeId),
      ),
    );
    log.info(`Deleted metric properties for node: ${groupId}/${nodeId}`);
    return createSuccess(true);
  } catch (error) {
    log.error(
      `Error deleting metric properties for node: ${groupId}/${nodeId}`,
      error,
    );
    return createFail(createErrorString(error));
  }
}

export async function deleteMetricPropertiesForDevice(
  db: Db,
  groupId: string,
  nodeId: string,
  deviceId: string,
) {
  try {
    await db.delete(metricProperties).where(
      and(
        eq(metricProperties.groupId, groupId),
        eq(metricProperties.nodeId, nodeId),
        eq(metricProperties.deviceId, deviceId),
      ),
    );
    log.info(
      `Deleted metric properties for device: ${groupId}/${nodeId}/${deviceId}`,
    );
    return createSuccess(true);
  } catch (error) {
    log.error(
      `Error deleting metric properties for device: ${groupId}/${nodeId}/${deviceId}`,
      error,
    );
    return createFail(createErrorString(error));
  }
}

export async function deleteMetricPropertiesForMetric(
  db: Db,
  groupId: string,
  nodeId: string,
  deviceId: string | null,
  metricId: string,
) {
  try {
    await db.delete(metricProperties).where(
      and(
        eq(metricProperties.groupId, groupId),
        eq(metricProperties.nodeId, nodeId),
        eq(metricProperties.deviceId, deviceId || ""),
        eq(metricProperties.metricId, metricId),
      ),
    );
    log.info(
      `Deleted metric properties for metric: ${groupId}/${nodeId}/${deviceId || ""}/${metricId}`,
    );
    return createSuccess(true);
  } catch (error) {
    log.error(
      `Error deleting metric properties for metric: ${groupId}/${nodeId}/${deviceId || ""}/${metricId}`,
      error,
    );
    return createFail(createErrorString(error));
  }
}
