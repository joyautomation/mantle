import { createSchema, createYoga } from "graphql-yoga";
import { validateHost, validatePort } from "./validation.ts";
import { getNode } from "./neuron.ts";
import type { SparkplugDevice, SparkplugNode } from "@joyautomation/neuron";
import { log } from "./log.ts";
import type { Args } from "@std/cli";

const flatten =
  <T extends { [id: string]: any }>(key: keyof T) =>
  (parent: T): T[keyof T][] => Object.values(parent[key]);

export function runServer(args: Args) {
  const node = getNode(args);
  const yoga = createYoga({
    schema: createSchema({
      typeDefs: /* GraphQL */ `
          type Query {
            info: String
            node: Node
          }
          type Node {
            id: String
            devices: [Device!]!
            metrics: [Metric!]!
          }
          type Device {
            id: String
            metrics: [Metric!]!
          }
          type Metric {
            id: String
            name: String
            value: String
            type: String
            scanRate: Int
          }
        `,
      resolvers: {
        Query: {
          info: () =>
            "Squid a bootstrapper and system monitor for project kraken edge appliances",
          node: () => node,
        },
        Node: {
          metrics: flatten<SparkplugNode>("metrics"),
          devices: flatten<SparkplugNode>("devices"),
        },
        Device: {
          metrics: flatten<SparkplugDevice>("metrics"),
        },
      },
    }),
  });
  Deno.serve(
    {
      port: validatePort(Deno.env.get("SQUID_PORT")),
      hostname: validateHost(Deno.env.get("SQUID_HOST")),
      onListen({ hostname, port }) {
        log.info(`Squid GraphQL API is running on ${hostname}:${port}`);
      },
    },
    yoga.fetch,
  );
}
