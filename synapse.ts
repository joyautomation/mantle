import { nanoid } from "nanoid";
import {
  createHost,
  flattenHostGroups,
  type SparkplugCreateHostInput,
  type SparkplugDeviceFlat,
  type SparkplugGroupFlat,
  type SparkplugHost,
  type SparkplugMetric,
  type SparkplugMetricFlat,
  type SparkplugMetricPropertyFlat,
  type SparkplugNodeFlat,
  type SparkplugTopic,
} from "@joyautomation/synapse";
import type { Args } from "@std/cli";
import { recordValues } from "./history.ts";
import type { Db } from "./db/db.ts";
import { pubsub } from "./pubsub.ts";
import type { UPayload } from "sparkplug-payload/lib/sparkplugbpayload.js";
import type { getBuilder } from "@joyautomation/conch";
import type { createClient } from "redis";
import { getMetricHierarchy } from "./redis.ts";
import { GraphQLError } from "graphql";
import { isSuccess } from "@joyautomation/dark-matter";
import Long from "long";

/**
 * Creates and returns a SparkplugHost instance based on the provided arguments or environment variables.
 * @param {Args} args - The command-line arguments object.
 * @returns {SparkplugHost} The created SparkplugHost instance.
 */
export function getHost(args: Args) {
  const config: SparkplugCreateHostInput = {
    brokerUrl: args.brokerUrl ||
      Deno.env.get("MANTLE_MQTT_BROKER_URL") ||
      "ssl://mqtt3.anywherescada.com:8883",
    username: args.username || Deno.env.get("MANTLE_MQTT_USERNAME") || "",
    password: args.password || Deno.env.get("MANTLE_MQTT_PASSWORD") || "",
    id: args.nodeId || Deno.env.get("MANTLE_MQTT_NODE_ID") || "test",
    clientId: `${
      args.clientId || Deno.env.get("MANTLE_MQTT_CLIENT_ID") || "mantle"
    }-${nanoid(7)}`,
    version: "spBv1.0",
    primaryHostId: args.primaryHostId ||
      Deno.env.get("MANTLE_MQTT_PRIMARY_HOST_ID") ||
      "test",
    sharedSubscriptionGroup: args.sharedSubscriptionGroup ||
      Deno.env.get("MANTLE_SHARED_GROUP"),
  };
  return createHost(config);
}

function convertIfLong<T>(value: T) {
  if (Long.isLong(value)) {
    return value.toNumber();
  }
  return value;
}

/**
 * Adds event listeners to the SparkplugHost for recording history events.
 * @param {Db} db - The database instance.
 * @param {SparkplugHost} host - The SparkplugHost instance.
 */
export function addHistoryEvents(
  db: Db,
  host: SparkplugHost,
  publisher?: ReturnType<typeof createClient>,
  subscriber?: ReturnType<typeof createClient>,
) {
  ["nbirth", "dbirth", "ndata", "ddata"].forEach((topic) => {
    host.events.on(topic, async (topic: SparkplugTopic, message: UPayload) => {
      recordValues(db, topic, message);
      if (publisher) {
        await Promise.all(
          message.metrics?.map((metric) => {
            const key = JSON.stringify({
              groupId: topic.groupId,
              nodeId: topic.edgeNode,
              deviceId: topic.deviceId,
              metricId: metric.name,
            });
            publisher.set(
              key,
              JSON.stringify({
                ...metric,
                timestamp: convertIfLong(metric.timestamp),
                value: convertIfLong(metric.value),
              }),
            );
          }) || [],
        );
      } else {
        pubsub.publish(
          "metricUpdate",
          message.metrics?.map((metric) => ({
            ...metric,
            groupId: topic.groupId,
            nodeId: topic.edgeNode,
            deviceId: topic.deviceId,
            metricId: metric.name,
          })),
        );
      }
    });
  });
}

/**
 * Adds the SparkplugHost and related types to the GraphQL schema.
 * @param {SparkplugHost} host - The SparkplugHost instance.
 * @param {PothosSchemaTypes.SchemaBuilder<PothosSchemaTypes.ExtendDefaultTypes<{}>>} builder - The schema builder instance.
 */
export function addHostToSchema(
  host: SparkplugHost,
  builder: ReturnType<typeof getBuilder>,
  redis?: ReturnType<typeof createClient>,
) {
  const SparkplugGroupRef = builder.objectRef<SparkplugGroupFlat>(
    "SparkplugGroup",
  );
  const SparkplugNodeRef = builder.objectRef<SparkplugNodeFlat>(
    "SparkplugNode",
  );
  const SparkplugDeviceRef = builder.objectRef<SparkplugDeviceFlat>(
    "SparkplugDevice",
  );
  const SparkplugMetricRef = builder.objectRef<SparkplugMetricFlat>(
    "SparkplugMetric",
  );
  const SparkplugMetricPropertyRef = builder.objectRef<
    SparkplugMetricPropertyFlat
  >("SparkplugMetricProperty");

  type SparkplugMetricUpdate = SparkplugMetric & {
    groupId: string;
    nodeId: string;
    deviceId: string;
  };
  const SparkplugMetricUpdateRef = builder.objectRef<SparkplugMetricUpdate>(
    "SparkplugMetricUpdate",
  );

  SparkplugGroupRef.implement({
    fields: (t) => ({
      id: t.string({ resolve: (parent) => parent.id }),
      nodes: t.expose("nodes", { type: [SparkplugNodeRef] }),
    }),
  });
  SparkplugNodeRef.implement({
    fields: (t) => ({
      id: t.exposeString("id"),
      metrics: t.expose("metrics", { type: [SparkplugMetricRef] }),
      devices: t.expose("devices", { type: [SparkplugDeviceRef] }),
    }),
  });
  SparkplugMetricRef.implement({
    fields: (t) => ({
      id: t.exposeString("name"),
      name: t.exposeString("name"),
      value: t.field({
        type: "String",
        resolve: async (parent) => {
          if (typeof parent.value === "function") {
            return (await parent?.value())?.toString();
          }
          return parent.value?.toString();
        },
      }),
      type: t.exposeString("type"),
      scanRate: t.exposeInt("scanRate"),
      properties: t.expose("properties", {
        type: [SparkplugMetricPropertyRef],
      }),
    }),
  });
  SparkplugMetricPropertyRef.implement({
    fields: (t) => ({
      id: t.exposeString("id"),
      type: t.exposeString("type"),
      value: t.field({
        type: "String",
        resolve: (parent) => parent.value?.toString(),
      }),
    }),
  });
  SparkplugDeviceRef.implement({
    fields: (t) => ({
      id: t.exposeString("id"),
      metrics: t.expose("metrics", { type: [SparkplugMetricRef] }),
    }),
  });
  SparkplugMetricUpdateRef.implement({
    fields: (t) => ({
      groupId: t.exposeString("groupId"),
      nodeId: t.exposeString("nodeId"),
      deviceId: t.exposeString("deviceId"),
      metricId: t.exposeString("name"),
      name: t.exposeString("name"),
      value: t.field({
        type: "String",
        resolve: (parent) => parent.value?.toString(),
      }),
      timestamp: t.field({
        type: "Float",
        resolve: (parent) => {
          if (parent.timestamp === null || parent.timestamp === undefined) {
            return Date.now(); // Current timestamp in milliseconds
          }

          // Handle Long type directly - just return the number value
          if (Long.isLong(parent.timestamp)) {
            return parent.timestamp.toNumber();
          }

          // At this point timestamp must be a number
          return parent.timestamp as number;
        },
      }),
    }),
  });
  builder.queryField("groups", (t) =>
    t.field({
      type: [SparkplugGroupRef],
      resolve: async () => {
        if (redis) {
          const result = await getMetricHierarchy(redis, host);
          if (isSuccess(result)) {
            return flattenHostGroups(result.output);
          } else {
            throw new GraphQLError(result.error);
          }
        } else {
          return flattenHostGroups(host);
        }
      },
    }));
  builder.subscriptionField("metricUpdate", (t) =>
    t.field({
      type: [SparkplugMetricUpdateRef],
      subscribe: () => pubsub.subscribe("metricUpdate"),
      resolve: (payload) => payload,
    }));
}
