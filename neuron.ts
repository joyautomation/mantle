import { nanoid } from "nanoid";
import { createNode } from "@joyautomation/neuron";
import type {
  SparkplugCreateDeviceInput,
  SparkplugCreateNodeInput,
  SparkplugMetric,
} from "@joyautomation/neuron";
import type { Args } from "@std/cli";

const nodeMetrics: { [id: string]: SparkplugMetric } = {};

const metrics = []];

const devices: { [id: string]: SparkplugCreateDeviceInput } = {
  squid: {
    id: "squid",
    metrics,
  },
};

export function getNode(args: Args) {
  const config: SparkplugCreateNodeInput = {
    brokerUrl: args.brokerUrl || Deno.env.get("SQUID_MQTT_BROKER_URL") ||
      "ssl://mqtt3.anywherescada.com:8883",
    username: args.username || Deno.env.get("SQUID_MQTT_USERNAME") || "",
    password: args.password || Deno.env.get("SQUID_MQTT_PASSWORD") || "",
    groupId: args.groupId || Deno.env.get("SQUID_MQTT_GROUP_ID") || "test",
    id: args.nodeId || Deno.env.get("SQUID_MQTT_NODE_ID") || "test",
    clientId: args.clientId ||
      `${Deno.env.get("SQUID_MQTT_CLIENT_ID")}-${nanoid(7)}`,
    version: "spBv1.0",
    metrics: nodeMetrics,
    devices,
  };
  return createNode(config);
}
