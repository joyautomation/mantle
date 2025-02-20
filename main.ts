import { createApp } from "@joyautomation/conch";
import { argDictionary } from "./cli.ts";
import { log } from "./log.ts";
import { addHistoryEvents, addHostToSchema, getHost } from "./synapse.ts";
import { getDb } from "./db/db.ts";
import { addHistoryToSchema } from "./history.ts";
import { getRedis } from "./redis.ts";
import { isSuccess } from "@joyautomation/dark-matter";

/**
 * Internal utility functions exposed for testing purposes
 * @internal
 */
export const _internal = {
  /** Function to get database connection and Drizzle ORM instance */
  getDb,
  /** Function to create and configure a SparkplugHost instance */
  getHost,
  getRedis,
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
    const redisResult = await _internal.getRedis(args);
    const host = _internal.getHost(args);
    if (isSuccess(redisResult)) {
      addHistoryEvents(db, host, redisResult.output);
      addHostToSchema(host, builder, redisResult.output);
    } else {
      addHistoryEvents(db, host);
      addHostToSchema(host, builder);
    }
    addHistoryToSchema(builder, db);
    return builder;
  }
);

main();
