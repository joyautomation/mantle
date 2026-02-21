import { nanoid } from "nanoid";
import {
  createHost,
  flattenHostGroups,
  getTemplateDefinitions,
  publishNodeCommand,
  publishDeviceCommand,
  publish,
  createSpbTopic,
  encodePayload,
  addSeqNumberCurry,
  type Modify,
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

const historianEnabled = Deno.env.get("MANTLE_HISTORIAN_ENABLED") !== "false";
import {
  deleteDeviceHistory,
  deleteMetricHistory,
  deleteNodeHistory,
  recordValues,
} from "./history.ts";
import {
  extractProperties,
  upsertMetricProperties,
  deleteMetricPropertiesForNode,
  deleteMetricPropertiesForDevice,
  deleteMetricPropertiesForMetric,
} from "./metric-properties.ts";
import type { Db } from "./db/db.ts";
import { pubsub } from "./pubsub.ts";
import type { UPayload } from "sparkplug-payload/lib/sparkplugbpayload.js";
import type { getBuilder } from "@joyautomation/conch";
import type { createClient } from "redis";
import {
  deleteRedisKeyForMetric,
  deleteRedisKeysForDevice,
  deleteRedisKeysForNode,
  getMetricHierarchy,
} from "./redis.ts";
import { GraphQLError } from "graphql";
import { isSuccess, pipe } from "@joyautomation/dark-matter";
import Long from "long";
import { Buffer } from "node:buffer";
import {
  deleteHiddenItemForMetric,
  deleteHiddenItemsForDevice,
  deleteHiddenItemsForNode,
  getHiddenItemKeys,
  getHiddenItems,
  hideDevice,
  hideMetric,
  hideNode,
  shouldFilter,
  unhideDevice,
  unhideMetric,
  unhideNode,
  type HiddenItem,
} from "./hidden.ts";
import { evaluateMetric } from "./alarms.ts";

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
      if (historianEnabled) {
        recordValues(db, topic, message);
      }
      // Evaluate alarm rules and persist metric properties
      for (const metric of message.metrics ?? []) {
        if (metric.name) {
          evaluateMetric(
            db,
            topic.groupId,
            topic.edgeNode,
            topic.deviceId ?? "",
            metric.name,
            convertIfLong(metric.value),
          );
          // Persist Sparkplug B properties (fire-and-forget)
          if (metric.properties) {
            const props = extractProperties(metric);
            if (props) {
              upsertMetricProperties(
                db,
                topic.groupId,
                topic.edgeNode,
                topic.deviceId ?? "",
                metric.name,
                props,
              );
            }
          }
        }
      }
      if (publisher) {
        await Promise.all(
          message.metrics?.map((metric) => {
            const key = JSON.stringify({
              groupId: topic.groupId,
              nodeId: topic.edgeNode,
              deviceId: topic.deviceId ?? "",
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
            deviceId: topic.deviceId ?? "",
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
 * @param {Db} db - The database instance for hidden items.
 * @param {ReturnType<typeof createClient>} redis - Optional Redis client.
 */
export function addHostToSchema(
  host: SparkplugHost,
  builder: ReturnType<typeof getBuilder>,
  db: Db,
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

  const HiddenItemRef = builder.objectRef<HiddenItem>("HiddenItem");

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
      templateRef: t.field({
        type: "String",
        nullable: true,
        resolve: (parent) =>
          (parent as SparkplugMetricFlat & { templateRef?: string })
            .templateRef ?? null,
      }),
      templateInstance: t.field({
        type: "String",
        nullable: true,
        resolve: (parent) =>
          (parent as SparkplugMetricFlat & { templateInstance?: string })
            .templateInstance ?? null,
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
  HiddenItemRef.implement({
    fields: (t) => ({
      groupId: t.exposeString("groupId"),
      nodeId: t.exposeString("nodeId"),
      deviceId: t.exposeString("deviceId"),
      metricId: t.exposeString("metricId"),
      hiddenAt: t.field({
        type: "String",
        resolve: (parent) => parent.hiddenAt.toISOString(),
      }),
    }),
  });
  builder.queryField("groups", (t) =>
    t.field({
      type: [SparkplugGroupRef],
      args: {
        includeHidden: t.arg.boolean({ defaultValue: false }),
      },
      resolve: async (_parent, args) => {
        let groups: SparkplugGroupFlat[];
        if (redis) {
          const result = await getMetricHierarchy(redis, host);
          if (isSuccess(result)) {
            groups = flattenHostGroups(result.output);
          } else {
            throw new GraphQLError(result.error);
          }
        } else {
          groups = flattenHostGroups(host);
        }

        // If includeHidden is true, return all groups without filtering
        if (args.includeHidden) {
          return groups;
        }

        // Get hidden item keys for filtering
        const hiddenKeys = await getHiddenItemKeys(db);
        if (hiddenKeys.size === 0) {
          return groups;
        }

        // Filter out hidden items
        return groups.map((group) => ({
          ...group,
          nodes: group.nodes
            .filter((node) => !shouldFilter(hiddenKeys, group.id, node.id))
            .map((node) => ({
              ...node,
              devices: node.devices
                .filter((device) => !shouldFilter(hiddenKeys, group.id, node.id, device.id))
                .map((device) => ({
                  ...device,
                  metrics: device.metrics.filter(
                    (metric) => !metric.name || !shouldFilter(hiddenKeys, group.id, node.id, device.id, metric.name)
                  ),
                })),
              metrics: node.metrics.filter(
                (metric) => !metric.name || !shouldFilter(hiddenKeys, group.id, node.id, "", metric.name)
              ),
            })),
        })).filter((group) => group.nodes.length > 0);
      },
    }));
  builder.queryField("hiddenItems", (t) =>
    t.field({
      type: [HiddenItemRef],
      resolve: async () => {
        const result = await getHiddenItems(db);
        if (isSuccess(result)) {
          return result.output;
        }
        throw new GraphQLError(result.error);
      },
    }));

  // Template definition types
  const TemplateMemberRef = builder.objectRef<{
    name: string;
    type: string;
  }>("TemplateMember");
  TemplateMemberRef.implement({
    fields: (t) => ({
      name: t.exposeString("name"),
      type: t.exposeString("type"),
    }),
  });

  const TemplateDefinitionRef = builder.objectRef<{
    name: string;
    version: string | null;
    members: { name: string; type: string }[];
  }>("TemplateDefinition");
  TemplateDefinitionRef.implement({
    fields: (t) => ({
      name: t.exposeString("name"),
      version: t.field({
        type: "String",
        nullable: true,
        resolve: (parent) => parent.version,
      }),
      members: t.expose("members", { type: [TemplateMemberRef] }),
    }),
  });

  builder.queryField("templateDefinitions", (t) =>
    t.field({
      type: [TemplateDefinitionRef],
      resolve: () => {
        const defs = getTemplateDefinitions(host);
        return Array.from(defs.entries()).map(([name, template]) => ({
          name,
          version: template.version ?? null,
          members: (template.metrics ?? []).map((m) => ({
            name: m.name ?? "",
            type: m.type ?? "Unknown",
          })),
        }));
      },
    }));
  builder.subscriptionField("metricUpdate", (t) =>
    t.field({
      type: [SparkplugMetricUpdateRef],
      subscribe: () => pubsub.subscribe("metricUpdate"),
      resolve: (payload) => payload,
    }));

  // Mutation to write metric values (for commands like rebirth)
  builder.mutationField("writeMetric", (t) =>
    t.field({
      type: "Boolean",
      args: {
        groupId: t.arg.string({ required: true }),
        nodeId: t.arg.string({ required: true }),
        deviceId: t.arg.string(),
        metricId: t.arg.string({ required: true }),
        value: t.arg.string({ required: true }),
      },
      resolve: (_parent, args) => {
        if (!host.mqtt) {
          throw new GraphQLError("MQTT client not connected");
        }

        const mqttConfig = {
          version: host.version || "spBv1.0",
          serverUrl: host.brokerUrl,
          clientId: host.clientId,
          keepalive: host.keepalive || 60,
          username: host.username,
          password: host.password,
          primaryHostId: host.primaryHostId,
        };

        // Parse the value based on metric name patterns
        let parsedValue: boolean | number | string = args.value;
        if (args.value === "true") parsedValue = true;
        else if (args.value === "false") parsedValue = false;
        else if (!isNaN(Number(args.value))) parsedValue = Number(args.value);

        // Determine metric type based on value
        let metricType: "Boolean" | "Float" | "String" = "String";
        if (typeof parsedValue === "boolean") metricType = "Boolean";
        else if (typeof parsedValue === "number") metricType = "Float";

        // Check if this is a control metric (Node Control/* or Device Control/*)
        const isControlMetric = args.metricId.startsWith("Node Control/") ||
          args.metricId.startsWith("Device Control/");

        if (isControlMetric) {
          // For control metrics, use publishNodeCommand/publishDeviceCommand
          // which wraps the name with the appropriate control prefix
          const commandName = args.metricId.split("/").pop() || args.metricId;

          if (args.deviceId) {
            publishDeviceCommand(
              host,
              commandName,
              metricType,
              parsedValue,
              args.groupId,
              args.nodeId,
              mqttConfig,
              host.mqtt,
              args.deviceId
            );
          } else {
            publishNodeCommand(
              host,
              commandName,
              metricType,
              parsedValue,
              args.groupId,
              args.nodeId,
              mqttConfig,
              host.mqtt
            );
          }
        } else {
          // For regular metrics, publish DCMD/NCMD with the raw metric name
          const commandType = args.deviceId ? "DCMD" : "NCMD";
          const topic = createSpbTopic(
            commandType,
            { ...mqttConfig, groupId: args.groupId, edgeNode: args.nodeId },
            args.deviceId || undefined
          );
          const payload: UPayload = {
            metrics: [
              {
                name: args.metricId,
                value: parsedValue,
                type: metricType,
              },
            ],
          };
          const toBuffer = (p: Uint8Array): Buffer => Buffer.from(p);
          publish(
            topic,
            pipe(
              payload,
              addSeqNumberCurry(host) as Modify<UPayload>,
              encodePayload,
              toBuffer
            ) as Buffer,
            host.mqtt
          );
        }

        return true;
      },
    })
  );

  // Hide/Unhide mutations
  builder.mutationField("hideNode", (t) =>
    t.field({
      type: "Boolean",
      args: {
        groupId: t.arg.string({ required: true }),
        nodeId: t.arg.string({ required: true }),
      },
      resolve: async (_parent, args) => {
        const result = await hideNode(db, args.groupId, args.nodeId);
        if (isSuccess(result)) {
          return result.output;
        }
        throw new GraphQLError(result.error);
      },
    })
  );

  builder.mutationField("unhideNode", (t) =>
    t.field({
      type: "Boolean",
      args: {
        groupId: t.arg.string({ required: true }),
        nodeId: t.arg.string({ required: true }),
      },
      resolve: async (_parent, args) => {
        const result = await unhideNode(db, args.groupId, args.nodeId);
        if (isSuccess(result)) {
          return result.output;
        }
        throw new GraphQLError(result.error);
      },
    })
  );

  builder.mutationField("hideDevice", (t) =>
    t.field({
      type: "Boolean",
      args: {
        groupId: t.arg.string({ required: true }),
        nodeId: t.arg.string({ required: true }),
        deviceId: t.arg.string({ required: true }),
      },
      resolve: async (_parent, args) => {
        const result = await hideDevice(db, args.groupId, args.nodeId, args.deviceId);
        if (isSuccess(result)) {
          return result.output;
        }
        throw new GraphQLError(result.error);
      },
    })
  );

  builder.mutationField("unhideDevice", (t) =>
    t.field({
      type: "Boolean",
      args: {
        groupId: t.arg.string({ required: true }),
        nodeId: t.arg.string({ required: true }),
        deviceId: t.arg.string({ required: true }),
      },
      resolve: async (_parent, args) => {
        const result = await unhideDevice(db, args.groupId, args.nodeId, args.deviceId);
        if (isSuccess(result)) {
          return result.output;
        }
        throw new GraphQLError(result.error);
      },
    })
  );

  builder.mutationField("hideMetric", (t) =>
    t.field({
      type: "Boolean",
      args: {
        groupId: t.arg.string({ required: true }),
        nodeId: t.arg.string({ required: true }),
        deviceId: t.arg.string(),
        metricId: t.arg.string({ required: true }),
      },
      resolve: async (_parent, args) => {
        const result = await hideMetric(db, args.groupId, args.nodeId, args.deviceId || null, args.metricId);
        if (isSuccess(result)) {
          return result.output;
        }
        throw new GraphQLError(result.error);
      },
    })
  );

  builder.mutationField("unhideMetric", (t) =>
    t.field({
      type: "Boolean",
      args: {
        groupId: t.arg.string({ required: true }),
        nodeId: t.arg.string({ required: true }),
        deviceId: t.arg.string(),
        metricId: t.arg.string({ required: true }),
      },
      resolve: async (_parent, args) => {
        const result = await unhideMetric(db, args.groupId, args.nodeId, args.deviceId || null, args.metricId);
        if (isSuccess(result)) {
          return result.output;
        }
        throw new GraphQLError(result.error);
      },
    })
  );

  // Delete mutations - permanently remove from memory, Redis cache, and database
  builder.mutationField("deleteNode", (t) =>
    t.field({
      type: "Boolean",
      args: {
        groupId: t.arg.string({ required: true }),
        nodeId: t.arg.string({ required: true }),
      },
      resolve: async (_parent, args) => {
        // Delete from in-memory host
        const group = host.groups[args.groupId];
        if (group?.nodes[args.nodeId]) {
          delete group.nodes[args.nodeId];
        }

        // Delete from Redis if available
        if (redis) {
          await deleteRedisKeysForNode(redis, args.groupId, args.nodeId);
        }

        // Delete from database history
        const result = await deleteNodeHistory(db, args.groupId, args.nodeId);
        if (!isSuccess(result)) {
          throw new GraphQLError(result.error);
        }

        // Delete from hidden_items table
        await deleteHiddenItemsForNode(db, args.groupId, args.nodeId);

        // Delete from metric_properties table
        await deleteMetricPropertiesForNode(db, args.groupId, args.nodeId);

        return true;
      },
    })
  );

  builder.mutationField("deleteDevice", (t) =>
    t.field({
      type: "Boolean",
      args: {
        groupId: t.arg.string({ required: true }),
        nodeId: t.arg.string({ required: true }),
        deviceId: t.arg.string({ required: true }),
      },
      resolve: async (_parent, args) => {
        // Delete from in-memory host
        const group = host.groups[args.groupId];
        if (group?.nodes[args.nodeId]?.devices[args.deviceId]) {
          delete group.nodes[args.nodeId].devices[args.deviceId];
        }

        // Delete from Redis if available
        if (redis) {
          await deleteRedisKeysForDevice(redis, args.groupId, args.nodeId, args.deviceId);
        }

        // Delete from database history
        const result = await deleteDeviceHistory(db, args.groupId, args.nodeId, args.deviceId);
        if (!isSuccess(result)) {
          throw new GraphQLError(result.error);
        }

        // Delete from hidden_items table
        await deleteHiddenItemsForDevice(db, args.groupId, args.nodeId, args.deviceId);

        // Delete from metric_properties table
        await deleteMetricPropertiesForDevice(db, args.groupId, args.nodeId, args.deviceId);

        return true;
      },
    })
  );

  builder.mutationField("deleteMetric", (t) =>
    t.field({
      type: "Boolean",
      args: {
        groupId: t.arg.string({ required: true }),
        nodeId: t.arg.string({ required: true }),
        deviceId: t.arg.string(),
        metricId: t.arg.string({ required: true }),
      },
      resolve: async (_parent, args) => {
        // Delete from in-memory host
        const group = host.groups[args.groupId];
        if (group?.nodes[args.nodeId]) {
          if (args.deviceId) {
            const device = group.nodes[args.nodeId].devices[args.deviceId];
            if (device?.metrics[args.metricId]) {
              delete device.metrics[args.metricId];
            }
          } else {
            const node = group.nodes[args.nodeId];
            if (node?.metrics[args.metricId]) {
              delete node.metrics[args.metricId];
            }
          }
        }

        // Delete from Redis if available
        if (redis) {
          await deleteRedisKeyForMetric(redis, args.groupId, args.nodeId, args.deviceId || null, args.metricId);
        }

        // Delete from database history
        const result = await deleteMetricHistory(db, args.groupId, args.nodeId, args.deviceId || null, args.metricId);
        if (!isSuccess(result)) {
          throw new GraphQLError(result.error);
        }

        // Delete from hidden_items table
        await deleteHiddenItemForMetric(db, args.groupId, args.nodeId, args.deviceId || null, args.metricId);

        // Delete from metric_properties table
        await deleteMetricPropertiesForMetric(db, args.groupId, args.nodeId, args.deviceId || null, args.metricId);

        return true;
      },
    })
  );
}
