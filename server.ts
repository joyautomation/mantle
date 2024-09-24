import { createYoga } from "graphql-yoga";
import { validateHost, validatePort } from "./validation.ts";
import { addHistoryEvents, addHostToSchema, getHost } from "./synapse.ts";
import { log } from "./log.ts";
import type { Args } from "@std/cli";
import { setLogLevel } from "@joyautomation/coral";
import { getDb } from "./db/db.ts";
import { getBuilder } from "./db/graphql.ts";

export const _internal = {
  getDb,
  getHost,
};

export async function runServer(args: Args) {
  setLogLevel(
    log,
    args["log-level"] || Deno.env.get("MANTLE_LOG_LEVEL") || "info",
  );
  const { db } = await _internal.getDb(args);
  const builder = getBuilder();
  const host = _internal.getHost(args);
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
