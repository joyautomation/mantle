import type { Args } from "@std/cli";
import {
  createErrorString,
  createFail,
  createSuccess,
  isSuccess,
  Result,
} from "@joyautomation/dark-matter";
import { createClient } from "redis";
import { log } from "./log.ts";
import {
  type SparkplugGroupFlat,
  type SparkplugNodeFlat,
  type SparkplugDeviceFlat,
  type SparkplugMetricFlat,
  SparkplugGroup,
  SparkplugNode,
  SparkplugDevice,
  SparkplugMetric,
  SparkplugHost,
  SparkplugTopic,
} from "@joyautomation/synapse";
import type { UMetric } from "sparkplug-payload/lib/sparkplugbpayload.js";
import Long from "long";

let publisher: ReturnType<typeof createClient>;
let subscriber: ReturnType<typeof createClient>;

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
  if (isSuccess(argsRedisUrlResult)) return argsRedisUrlResult.output;
  const mantleRedisUrlResult = validateRedisUrl(
    Deno.env.get("MANTLE_REDIS_URL")
  );
  if (isSuccess(mantleRedisUrlResult)) return mantleRedisUrlResult.output;
  return "redis://localhost:6379";
}

export async function getPublisher(args: Args) {
  try {
    if (!publisher) {
      const url = createRedisConnectionString(args);
      publisher = createClient({
        url,
      });
      await publisher.connect();
      log.info(`Publisher connected to Redis at ${url}`);
    }
    return createSuccess(publisher);
  } catch (e) {
    return createFail(createErrorString(e));
  }
}

export async function getSubscriber(args: Args) {
  try {
    if (!subscriber) {
      const url = createRedisConnectionString(args);
      const keyPattern = "__keyevent@0__:*"; // Subscribe to all key events
      subscriber = createClient({ url });
      await subscriber.connect();
      subscriber.configSet("notify-keyspace-events", "KEA");
      log.info(`Subscriber connected to Redis at ${url}`);
    }
    return createSuccess(subscriber);
  } catch (e) {
    return createFail(createErrorString(e));
  }
}

export function subscribeToKeys(subscriber: ReturnType<typeof createClient>, onMessage: (key: string, topic: string) => void) {
  const keyPattern = "__keyevent@0__:*"; // Subscribe to all key events
  subscriber.pSubscribe(keyPattern, onMessage);
}

export async function getMetricHierarchy(
  redis: ReturnType<typeof createClient>,
  host: SparkplugHost
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
            name: parsedValue.name,
            type: parsedValue.type,
            value: parsedValue.value,
          };

          if (deviceId) {
            // Ensure device exists
            if (!hierarchy.groups[groupId].nodes[nodeId].devices[deviceId]) {
              hierarchy.groups[groupId].nodes[nodeId].devices[deviceId] = {
                id: deviceId,
                metrics: {},
              };
            }
            if (parsedValue?.name)
                hierarchy.groups[groupId].nodes[nodeId].devices[deviceId].metrics[
            parsedValue.name
        ] = { ...metric, value: Long.isLong(metric.value) ? metric.value.toNumber() : metric.value };
    } else {
            if (parsedValue?.name)
              hierarchy.groups[groupId].nodes[nodeId].metrics[
                parsedValue.name
              ] = { ...metric, value: Long.isLong(metric.value) ? metric.value.toNumber() : metric.value };
          }
        } catch {
          console.log(
            `Failed to parse value for ${groupId}/${nodeId}${
              deviceId ? "/" + deviceId : ""
            }: ${value}`
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
