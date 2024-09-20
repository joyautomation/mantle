import { nanoid } from "nanoid";
import {
  createHost,
  flattenHostGroups,
  type SparkplugCreateHostInput,
  type SparkplugDeviceFlat,
  type SparkplugGroupFlat,
  type SparkplugHost,
  type SparkplugMetric,
  type SparkplugNodeFlat,
} from "@joyautomation/neuron";
import type { Args } from "@std/cli";
import { recordValues } from "./history.ts";

export function getHost(args: Args) {
  const config: SparkplugCreateHostInput = {
    brokerUrl: args.brokerUrl || Deno.env.get("SQUID_MQTT_BROKER_URL") ||
      "ssl://mqtt3.anywherescada.com:8883",
    username: args.username || Deno.env.get("SQUID_MQTT_USERNAME") || "",
    password: args.password || Deno.env.get("SQUID_MQTT_PASSWORD") || "",
    id: args.nodeId || Deno.env.get("SQUID_MQTT_NODE_ID") || "test",
    clientId: args.clientId ||
      `${Deno.env.get("SQUID_MQTT_CLIENT_ID")}-${nanoid(7)}`,
    version: "spBv1.0",
    primaryHostId: args.primaryHostId ||
      Deno.env.get("SQUID_MQTT_PRIMARY_HOST_ID") || "test",
  };
  return createHost(config);
}

export function addHistoryEvents(host: SparkplugHost) {
  host.events.on("ndata", (topic, message) => {
    recordValues(topic, message);
  });
  host.events.on("ddata", (topic, message) => {
    recordValues(topic, message);
  });
}

export function addHostToSchema(
  host: SparkplugHost,
  builder: PothosSchemaTypes.SchemaBuilder<
    PothosSchemaTypes.ExtendDefaultTypes<{}>
  >,
) {
  const SparkplugHostRef = builder.objectRef<SparkplugHost>(
    "SparkplugHost",
  );
  const SparkplugGroupRef = builder.objectRef<SparkplugGroupFlat>(
    "SparkplugGroup",
  );
  const SparkplugNodeRef = builder.objectRef<SparkplugNodeFlat>(
    "SparkplugNode",
  );
  const SparkplugDeviceRef = builder.objectRef<SparkplugDeviceFlat>(
    "SparkplugDevice",
  );
  const SparkplugMetricRef = builder.objectRef<SparkplugMetric>(
    "SparkplugMetric",
  );

  SparkplugHostRef.implement({
    fields: (t) => ({
      id: t.string({ resolve: (parent) => parent.id }),
      groups: t.field({
        type: [SparkplugGroupRef],
        resolve: (parent) => flattenHostGroups(parent),
      }),
    }),
  });
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
      name: t.exposeString("name"),
      value: t.string({
        resolve: (parent) => parent.value?.toString(),
      }),
      type: t.exposeString("type"),
    }),
  });
  SparkplugDeviceRef.implement({
    fields: (t) => ({
      id: t.exposeString("id"),
      metrics: t.expose("metrics", { type: [SparkplugMetricRef] }),
    }),
  });
  builder.queryField("host", (t) =>
    t.field({
      type: SparkplugHostRef,
      resolve: () => host,
    }));
}
