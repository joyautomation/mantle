import type { Args } from "@std/cli";
import {
  createErrorString,
  createFail,
  createSuccess,
  isSuccess,
  type Result,
} from "@joyautomation/dark-matter";
import { createClient } from "redis";
import { log } from "./log.ts";
import type { SparkplugHost } from "@joyautomation/synapse";
import type { UMetric } from "sparkplug-payload/lib/sparkplugbpayload.js";
import Long from "long";

let publisher: ReturnType<typeof createClient> | undefined;
let subscriber: ReturnType<typeof createClient> | undefined;

/**
 * Validates if the given URL is a valid Redis URL
 * @param url - The URL to validate
 * @returns true if the URL is valid for Redis, false otherwise
 */
export function validateRedisUrl(url: string | undefined): Result<string> {
  if (!url) return createFail("Invalid URL");
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol === "redis:" || parsedUrl.protocol === "rediss:") {
      return createSuccess(url);
    } else {
      return createFail("Invalid protocol");
    }
  } catch (e) {
    return createFail(createErrorString(e));
  }
}

function createRedisConnectionString(args: Args) {
  const argsRedisUrlResult = validateRedisUrl(args["redis-url"]);
  if (isSuccess(argsRedisUrlResult)) {
    log.debug("redis url arg valid: ", argsRedisUrlResult.output);
    return argsRedisUrlResult.output;
  } else {
    log.debug("redis url arg invalid: ", argsRedisUrlResult.error);
  }
  const mantleRedisUrlResult = validateRedisUrl(
    Deno.env.get("MANTLE_REDIS_URL"),
  );
  if (isSuccess(mantleRedisUrlResult)) {
    log.debug(
      "redis url environment variable valid: ",
      mantleRedisUrlResult.output,
    );
    return mantleRedisUrlResult.output;
  } else {
    log.debug(
      "redis url environment variable invalid: ",
      mantleRedisUrlResult.error,
    );
  }
  log.debug('using default redis url: "redis://localhost:6379"');
  return "redis://localhost:6379";
}

export async function getPublisher(args: Args) {
  const url = createRedisConnectionString(args);
  try {
    if (!publisher) {
      publisher = createClient({
        url,
      });
      await publisher.connect();
      log.info(`Publisher connected to Redis at ${url}`);
    }
    return createSuccess(publisher);
  } catch (e) {
    publisher = undefined;
    return createFail(
      `Failed to connect to Redis at ${url}: ${createErrorString(e)}`,
    );
  }
}

export async function getPublisherRetry(
  args: Args,
  maxRetries: number,
  delay: number,
) {
  let retries = 0;
  while (retries < maxRetries) {
    const publisherResult = await getPublisher(args);
    if (isSuccess(publisherResult)) {
      return publisherResult;
    }
    retries++;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  return createFail(`Failed to connect to Redis after ${maxRetries} retries`);
}

export async function getSubscriber(args: Args) {
  const url = createRedisConnectionString(args);
  try {
    if (!subscriber) {
      subscriber = createClient({ url });
      await subscriber.connect();
      subscriber.configSet("notify-keyspace-events", "KEA");
      log.info(`Subscriber connected to Redis at ${url}`);
    }
    return createSuccess(subscriber);
  } catch (e) {
    subscriber = undefined;
    return createFail(
      `Failed to connect to Redis at ${url}: ${createErrorString(e)}`,
    );
  }
}

export async function getSubscriberRetry(
  args: Args,
  maxRetries: number,
  delay: number,
) {
  let retries = 0;
  while (retries < maxRetries) {
    const subscriberResult = await getSubscriber(args);
    if (isSuccess(subscriberResult)) {
      return subscriberResult;
    }
    retries++;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  return createFail(`Failed to connect to Redis after ${maxRetries} retries`);
}

export function subscribeToKeys(
  subscriber: ReturnType<typeof createClient>,
  onMessage: (key: string, topic: string) => void,
) {
  const keyPattern = "__keyevent@0__:*"; // Subscribe to all key events
  subscriber.pSubscribe(keyPattern, onMessage);
}

export async function getMetricHierarchy(
  redis: ReturnType<typeof createClient>,
  host: SparkplugHost,
): Promise<Result<SparkplugHost>> {
  try {
    // Get all keys matching the pattern that could be either 3 or 4 parts
    const keys = await redis.keys("*");

    // Initialize the hierarchy object with a copy of the host
    const hierarchy: SparkplugHost = {
      ...host,
      groups: {},
    };

    // Get all values in a single pipeline
    const pipeline = redis.multi();
    keys.forEach((key) => pipeline.get(key));
    const values = await pipeline.exec();

    // Process each key-value pair
    keys.forEach((key, index) => {
      try {
        const topic = JSON.parse(key);
        const { groupId, nodeId, deviceId } = topic;
        const value = values[index];

        // Create group if it doesn't exist
        if (!hierarchy.groups[groupId]) {
          hierarchy.groups[groupId] = {
            id: groupId,
            nodes: {},
          };
        }

        // Create node if it doesn't exist
        if (!hierarchy.groups[groupId].nodes[nodeId]) {
          hierarchy.groups[groupId].nodes[nodeId] = {
            id: nodeId,
            devices: {},
            metrics: {},
          };
        }

        // Set the metric
        try {
          const parsedValue = JSON.parse(value as string) as UMetric;
          const metric = {
            ...parsedValue,
          };

          if (deviceId) {
            // Ensure device exists
            if (!hierarchy.groups[groupId].nodes[nodeId].devices[deviceId]) {
              hierarchy.groups[groupId].nodes[nodeId].devices[deviceId] = {
                id: deviceId,
                metrics: {},
              };
            }
            if (parsedValue?.name) {
              hierarchy.groups[groupId].nodes[nodeId].devices[deviceId].metrics[
                parsedValue.name
              ] = {
                ...metric,
                value: Long.isLong(metric.value)
                  ? metric.value.toNumber()
                  : metric.value,
              };
            }
          } else {
            if (parsedValue?.name) {
              hierarchy.groups[groupId].nodes[nodeId].metrics[
                parsedValue.name
              ] = {
                ...metric,
                value: Long.isLong(metric.value)
                  ? metric.value.toNumber()
                  : metric.value,
              };
            }
          }
        } catch {
          console.log(
            `Failed to parse value for ${groupId}/${nodeId}${
              deviceId ? "/" + deviceId : ""
            }: ${value}`,
          );
        }
      } catch (e) {
        console.log(`Failed to parse key: ${key}`, e);
      }
    });

    return createSuccess(hierarchy);
  } catch (e) {
    return createFail(createErrorString(e));
  }
}

/**
 * Delete all Redis keys for a specific node
 */
export async function deleteRedisKeysForNode(
  redis: ReturnType<typeof createClient>,
  groupId: string,
  nodeId: string,
): Promise<Result<{ deletedCount: number }>> {
  try {
    const keys = await redis.keys("*");
    const keysToDelete = keys.filter((key) => {
      try {
        const parsed = JSON.parse(key);
        return parsed.groupId === groupId && parsed.nodeId === nodeId;
      } catch {
        return false;
      }
    });

    if (keysToDelete.length > 0) {
      await redis.del(keysToDelete);
    }

    log.info(`Deleted ${keysToDelete.length} Redis keys for node: ${groupId}/${nodeId}`);
    return createSuccess({ deletedCount: keysToDelete.length });
  } catch (e) {
    log.error(`Error deleting Redis keys for node: ${groupId}/${nodeId}`, e);
    return createFail(createErrorString(e));
  }
}

/**
 * Delete all Redis keys for a specific device
 */
export async function deleteRedisKeysForDevice(
  redis: ReturnType<typeof createClient>,
  groupId: string,
  nodeId: string,
  deviceId: string,
): Promise<Result<{ deletedCount: number }>> {
  try {
    const keys = await redis.keys("*");
    const keysToDelete = keys.filter((key) => {
      try {
        const parsed = JSON.parse(key);
        return (
          parsed.groupId === groupId &&
          parsed.nodeId === nodeId &&
          parsed.deviceId === deviceId
        );
      } catch {
        return false;
      }
    });

    if (keysToDelete.length > 0) {
      await redis.del(keysToDelete);
    }

    log.info(`Deleted ${keysToDelete.length} Redis keys for device: ${groupId}/${nodeId}/${deviceId}`);
    return createSuccess({ deletedCount: keysToDelete.length });
  } catch (e) {
    log.error(`Error deleting Redis keys for device: ${groupId}/${nodeId}/${deviceId}`, e);
    return createFail(createErrorString(e));
  }
}

/**
 * Delete a single Redis key for a specific metric
 */
export async function deleteRedisKeyForMetric(
  redis: ReturnType<typeof createClient>,
  groupId: string,
  nodeId: string,
  deviceId: string | null,
  metricId: string,
): Promise<Result<{ deletedCount: number }>> {
  try {
    const key = JSON.stringify({
      groupId,
      nodeId,
      deviceId: deviceId || null,
      metricId,
    });

    const deleted = await redis.del(key);

    log.info(`Deleted Redis key for metric: ${groupId}/${nodeId}/${deviceId || ""}/${metricId}`);
    return createSuccess({ deletedCount: deleted });
  } catch (e) {
    log.error(`Error deleting Redis key for metric: ${groupId}/${nodeId}/${deviceId || ""}/${metricId}`, e);
    return createFail(createErrorString(e));
  }
}
