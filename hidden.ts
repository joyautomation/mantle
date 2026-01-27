import type { Db } from "./db/db.ts";
import { hiddenItems } from "./db/schema.ts";
import type { HiddenItemRecord } from "./db/schema.ts";
import { and, eq, or, sql } from "drizzle-orm";
import {
  createErrorString,
  createFail,
  createSuccess,
} from "@joyautomation/dark-matter";
import { log } from "./log.ts";

export type HiddenItem = {
  groupId: string;
  nodeId: string;
  deviceId: string;
  metricId: string;
  hiddenAt: Date;
};

/**
 * Hide a node (all its devices and metrics will be hidden)
 */
export async function hideNode(
  db: Db,
  groupId: string,
  nodeId: string,
) {
  try {
    await db.insert(hiddenItems).values({
      groupId,
      nodeId,
      deviceId: "",
      metricId: "",
      hiddenAt: new Date(),
    }).onConflictDoNothing();
    log.info(`Hidden node: ${groupId}/${nodeId}`);
    return createSuccess(true);
  } catch (error) {
    log.error(`Error hiding node: ${groupId}/${nodeId}`, error);
    return createFail(createErrorString(error));
  }
}

/**
 * Unhide a node
 */
export async function unhideNode(
  db: Db,
  groupId: string,
  nodeId: string,
) {
  try {
    await db.delete(hiddenItems).where(
      and(
        eq(hiddenItems.groupId, groupId),
        eq(hiddenItems.nodeId, nodeId),
        eq(hiddenItems.deviceId, ""),
        eq(hiddenItems.metricId, ""),
      ),
    );
    log.info(`Unhidden node: ${groupId}/${nodeId}`);
    return createSuccess(true);
  } catch (error) {
    log.error(`Error unhiding node: ${groupId}/${nodeId}`, error);
    return createFail(createErrorString(error));
  }
}

/**
 * Hide a device (all its metrics will be hidden)
 */
export async function hideDevice(
  db: Db,
  groupId: string,
  nodeId: string,
  deviceId: string,
) {
  try {
    await db.insert(hiddenItems).values({
      groupId,
      nodeId,
      deviceId,
      metricId: "",
      hiddenAt: new Date(),
    }).onConflictDoNothing();
    log.info(`Hidden device: ${groupId}/${nodeId}/${deviceId}`);
    return createSuccess(true);
  } catch (error) {
    log.error(`Error hiding device: ${groupId}/${nodeId}/${deviceId}`, error);
    return createFail(createErrorString(error));
  }
}

/**
 * Unhide a device
 */
export async function unhideDevice(
  db: Db,
  groupId: string,
  nodeId: string,
  deviceId: string,
) {
  try {
    await db.delete(hiddenItems).where(
      and(
        eq(hiddenItems.groupId, groupId),
        eq(hiddenItems.nodeId, nodeId),
        eq(hiddenItems.deviceId, deviceId),
        eq(hiddenItems.metricId, ""),
      ),
    );
    log.info(`Unhidden device: ${groupId}/${nodeId}/${deviceId}`);
    return createSuccess(true);
  } catch (error) {
    log.error(`Error unhiding device: ${groupId}/${nodeId}/${deviceId}`, error);
    return createFail(createErrorString(error));
  }
}

/**
 * Hide a specific metric
 */
export async function hideMetric(
  db: Db,
  groupId: string,
  nodeId: string,
  deviceId: string | null,
  metricId: string,
) {
  try {
    await db.insert(hiddenItems).values({
      groupId,
      nodeId,
      deviceId: deviceId || "",
      metricId,
      hiddenAt: new Date(),
    }).onConflictDoNothing();
    log.info(`Hidden metric: ${groupId}/${nodeId}/${deviceId || ""}/${metricId}`);
    return createSuccess(true);
  } catch (error) {
    log.error(`Error hiding metric: ${groupId}/${nodeId}/${deviceId || ""}/${metricId}`, error);
    return createFail(createErrorString(error));
  }
}

/**
 * Unhide a specific metric
 */
export async function unhideMetric(
  db: Db,
  groupId: string,
  nodeId: string,
  deviceId: string | null,
  metricId: string,
) {
  try {
    await db.delete(hiddenItems).where(
      and(
        eq(hiddenItems.groupId, groupId),
        eq(hiddenItems.nodeId, nodeId),
        eq(hiddenItems.deviceId, deviceId || ""),
        eq(hiddenItems.metricId, metricId),
      ),
    );
    log.info(`Unhidden metric: ${groupId}/${nodeId}/${deviceId || ""}/${metricId}`);
    return createSuccess(true);
  } catch (error) {
    log.error(`Error unhiding metric: ${groupId}/${nodeId}/${deviceId || ""}/${metricId}`, error);
    return createFail(createErrorString(error));
  }
}

/**
 * Get all hidden items
 */
export async function getHiddenItems(db: Db) {
  try {
    const items = await db.select().from(hiddenItems);
    return createSuccess(items as HiddenItem[]);
  } catch (error) {
    log.error("Error getting hidden items", error);
    return createFail(createErrorString(error));
  }
}

/**
 * Check if a node is hidden (directly hidden, not inherited)
 */
export async function isNodeHidden(
  db: Db,
  groupId: string,
  nodeId: string,
): Promise<boolean> {
  try {
    const result = await db.select().from(hiddenItems).where(
      and(
        eq(hiddenItems.groupId, groupId),
        eq(hiddenItems.nodeId, nodeId),
        eq(hiddenItems.deviceId, ""),
        eq(hiddenItems.metricId, ""),
      ),
    );
    return result.length > 0;
  } catch (error) {
    log.error(`Error checking if node is hidden: ${groupId}/${nodeId}`, error);
    return false;
  }
}

/**
 * Check if a device is hidden (directly or via parent node)
 */
export async function isDeviceHidden(
  db: Db,
  groupId: string,
  nodeId: string,
  deviceId: string,
): Promise<boolean> {
  try {
    const result = await db.select().from(hiddenItems).where(
      or(
        // Device directly hidden
        and(
          eq(hiddenItems.groupId, groupId),
          eq(hiddenItems.nodeId, nodeId),
          eq(hiddenItems.deviceId, deviceId),
          eq(hiddenItems.metricId, ""),
        ),
        // Parent node hidden
        and(
          eq(hiddenItems.groupId, groupId),
          eq(hiddenItems.nodeId, nodeId),
          eq(hiddenItems.deviceId, ""),
          eq(hiddenItems.metricId, ""),
        ),
      ),
    );
    return result.length > 0;
  } catch (error) {
    log.error(`Error checking if device is hidden: ${groupId}/${nodeId}/${deviceId}`, error);
    return false;
  }
}

/**
 * Check if a metric is hidden (directly or via parent node/device)
 */
export async function isMetricHidden(
  db: Db,
  groupId: string,
  nodeId: string,
  deviceId: string | null,
  metricId: string,
): Promise<boolean> {
  try {
    const conditions = [
      // Metric directly hidden
      and(
        eq(hiddenItems.groupId, groupId),
        eq(hiddenItems.nodeId, nodeId),
        eq(hiddenItems.deviceId, deviceId || ""),
        eq(hiddenItems.metricId, metricId),
      ),
      // Parent node hidden
      and(
        eq(hiddenItems.groupId, groupId),
        eq(hiddenItems.nodeId, nodeId),
        eq(hiddenItems.deviceId, ""),
        eq(hiddenItems.metricId, ""),
      ),
    ];

    // If it's a device metric, also check if parent device is hidden
    if (deviceId) {
      conditions.push(
        and(
          eq(hiddenItems.groupId, groupId),
          eq(hiddenItems.nodeId, nodeId),
          eq(hiddenItems.deviceId, deviceId),
          eq(hiddenItems.metricId, ""),
        ),
      );
    }

    const result = await db.select().from(hiddenItems).where(or(...conditions));
    return result.length > 0;
  } catch (error) {
    log.error(`Error checking if metric is hidden: ${groupId}/${nodeId}/${deviceId || ""}/${metricId}`, error);
    return false;
  }
}

/**
 * Get a set of hidden item keys for efficient filtering
 * Returns a Set with keys like "group/node", "group/node/device", "group/node/device/metric"
 */
export async function getHiddenItemKeys(db: Db): Promise<Set<string>> {
  try {
    const items = await db.select().from(hiddenItems);
    const keys = new Set<string>();
    for (const item of items) {
      // Create key based on what level this hidden item targets
      if (item.metricId) {
        // Specific metric hidden
        keys.add(`${item.groupId}/${item.nodeId}/${item.deviceId}/${item.metricId}`);
      } else if (item.deviceId) {
        // Device hidden (hides all its metrics)
        keys.add(`device:${item.groupId}/${item.nodeId}/${item.deviceId}`);
      } else {
        // Node hidden (hides all devices and metrics)
        keys.add(`node:${item.groupId}/${item.nodeId}`);
      }
    }
    return keys;
  } catch (error) {
    log.error("Error getting hidden item keys", error);
    return new Set();
  }
}

/**
 * Check if an item should be filtered based on hidden keys
 */
export function shouldFilter(
  hiddenKeys: Set<string>,
  groupId: string,
  nodeId: string,
  deviceId?: string,
  metricId?: string,
): boolean {
  // Check if node is hidden
  if (hiddenKeys.has(`node:${groupId}/${nodeId}`)) {
    return true;
  }

  // Check if device is hidden
  if (deviceId && hiddenKeys.has(`device:${groupId}/${nodeId}/${deviceId}`)) {
    return true;
  }

  // Check if specific metric is hidden
  if (metricId) {
    const metricKey = `${groupId}/${nodeId}/${deviceId || ""}/${metricId}`;
    if (hiddenKeys.has(metricKey)) {
      return true;
    }
  }

  return false;
}

/**
 * Delete all hidden items for a node (including devices and metrics)
 */
export async function deleteHiddenItemsForNode(
  db: Db,
  groupId: string,
  nodeId: string,
) {
  try {
    await db.delete(hiddenItems).where(
      and(
        eq(hiddenItems.groupId, groupId),
        eq(hiddenItems.nodeId, nodeId),
      ),
    );
    log.info(`Deleted hidden items for node: ${groupId}/${nodeId}`);
    return createSuccess(true);
  } catch (error) {
    log.error(`Error deleting hidden items for node: ${groupId}/${nodeId}`, error);
    return createFail(createErrorString(error));
  }
}

/**
 * Delete all hidden items for a device (including metrics)
 */
export async function deleteHiddenItemsForDevice(
  db: Db,
  groupId: string,
  nodeId: string,
  deviceId: string,
) {
  try {
    await db.delete(hiddenItems).where(
      and(
        eq(hiddenItems.groupId, groupId),
        eq(hiddenItems.nodeId, nodeId),
        eq(hiddenItems.deviceId, deviceId),
      ),
    );
    log.info(`Deleted hidden items for device: ${groupId}/${nodeId}/${deviceId}`);
    return createSuccess(true);
  } catch (error) {
    log.error(`Error deleting hidden items for device: ${groupId}/${nodeId}/${deviceId}`, error);
    return createFail(createErrorString(error));
  }
}

/**
 * Delete hidden item for a specific metric
 */
export async function deleteHiddenItemForMetric(
  db: Db,
  groupId: string,
  nodeId: string,
  deviceId: string | null,
  metricId: string,
) {
  try {
    await db.delete(hiddenItems).where(
      and(
        eq(hiddenItems.groupId, groupId),
        eq(hiddenItems.nodeId, nodeId),
        eq(hiddenItems.deviceId, deviceId || ""),
        eq(hiddenItems.metricId, metricId),
      ),
    );
    log.info(`Deleted hidden item for metric: ${groupId}/${nodeId}/${deviceId || ""}/${metricId}`);
    return createSuccess(true);
  } catch (error) {
    log.error(`Error deleting hidden item for metric: ${groupId}/${nodeId}/${deviceId || ""}/${metricId}`, error);
    return createFail(createErrorString(error));
  }
}
