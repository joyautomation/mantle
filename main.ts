import { createApp } from "@joyautomation/conch";
import { argDictionary } from "./cli.ts";
import { log } from "./log.ts";
import { addHistoryEvents, addHostToSchema, getHost } from "./synapse.ts";
import { getDb } from "./db/db.ts";
import { addHistoryToSchema } from "./history.ts";

export const _internal = {
  getDb,
  getHost,
};

/**
 * The main function that runs the Squid application.
 * It parses command-line arguments, handles help and version flags,
 * and starts the server if no special flags are provided.
 * we use dynamic import to defer the server start until we have parsed the arguments
 * this prevents the SparkplugNode from being created if we're not going to run the server yet
 * @async
 * @returns {Promise<void>}
 */
const main = createApp(
  "mantle",
  "Mantle, an MQTT Sparkplug B data aggregator and historian.",
  "MANTLE",
  argDictionary,
  true, //don' add subscriptions
  false, //don't add mutations
  4001,
  "0.0.0.0",
  log,
  async (builder, args) => {
    const { db } = await _internal.getDb(args);
    const host = _internal.getHost(args);
    addHistoryEvents(db, host);
    addHistoryToSchema(builder, db);
    addHostToSchema(host, builder);
    return builder;
  }
);

main();
