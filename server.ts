import { addHistoryEvents, addHostToSchema, getHost } from "./synapse.ts";
import { log } from "./log.ts";
import { getDb } from "./db/db.ts";
import { createRunServer } from "@joyautomation/conch";

export const _internal = {
  getDb,
  getHost,
};

export const runServer = createRunServer(
  "MANTLE",
  4000,
  "0.0.0.0",
  log,
  async (builder, args) => {
    const { db } = await _internal.getDb(args);
    const host = _internal.getHost(args);
    addHistoryEvents(db, host);
    addHostToSchema(host, builder);
    return builder;
  },
);
