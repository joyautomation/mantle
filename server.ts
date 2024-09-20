import { createYoga } from "graphql-yoga";
import { validateHost, validatePort } from "./validation.ts";
import { addHistoryEvents, addHostToSchema, getHost } from "./neuron.ts";
import { log } from "./log.ts";
import type { Args } from "@std/cli";
import SchemaBuilder from "@pothos/core";
import { setLogLevel } from "@joyautomation/coral";
import { type Db, getDb } from "./db/db.ts";

const flatten =
  <T extends { [id: string]: any }>(key: keyof T) =>
  (parent: T): T[keyof T][] => Object.values(parent[key]);

export async function runServer(args: Args) {
  setLogLevel(log, args.logLevel);
  const db = await getDb(args);
  const builder = new SchemaBuilder({});

  builder.queryType({
    fields: (t) => ({
      info: t.string({
        resolve: () => `Mantle Sparkplug B Data Aggregator.`,
      }),
    }),
  });

  const host = getHost(args);
  addHistoryEvents(db, host);
  addHostToSchema(host, builder);
  const schema = builder.toSchema();
  const yoga = createYoga({
    schema,
  });
  Deno.serve(
    {
      port: validatePort(Deno.env.get("MANTLE_PORT")),
      hostname: validateHost(Deno.env.get("MANTLE_HOST")),
      onListen({ hostname, port }) {
        log.info(`Mantle GraphQL API is running on ${hostname}:${port}`);
      },
    },
    yoga.fetch,
  );
}
