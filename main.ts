import { createApp } from "@joyautomation/conch";
import { argDictionary } from "./cli.ts";
import { log } from "./log.ts";
import { addHistoryEvents, addHostToSchema, getHost } from "./synapse.ts";
import { getDb } from "./db/db.ts";
import { addHistoryToSchema } from "./history.ts";
import { getPublisher, getSubscriber, subscribeToKeys } from "./redis.ts";
import { isFail, isSuccess } from "@joyautomation/dark-matter";
import { pubsub } from "./pubsub.ts";

/**
 * Internal utility functions exposed for testing purposes
 * @internal
 */
export const _internal = {
  /** Function to get database connection and Drizzle ORM instance */
  getDb,
  /** Function to create and configure a SparkplugHost instance */
  getHost,
  getPublisher,
  getSubscriber,
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
    const publisherResult = await _internal.getPublisher(args);
    const subscriberResult = await _internal.getSubscriber(args);
    const host = _internal.getHost(args);
    if (isSuccess(publisherResult) && isSuccess(subscriberResult)) {
      log.debug("Using key value store")
      const publisher = publisherResult.output;
      const subscriber = subscriberResult.output;
      addHistoryEvents(db, host, publisher, subscriber);
      addHostToSchema(host, builder, publisher);
      subscribeToKeys(subscriber, async (key: string, _topic: string) => {
        const value = await publisher.get(key);
        if (value) {
          pubsub.publish(
            "metricUpdate",
            [{
              ...JSON.parse(value),
              ...JSON.parse(key),
            }]
          );
        }
      });
    } else {
      if (isFail(publisherResult)) log.info(publisherResult.error)
      if (isFail(subscriberResult)) log.info(subscriberResult.error)
      log.debug("Using in-memory database")
      addHistoryEvents(db, host);
      addHostToSchema(host, builder);
    }
    addHistoryToSchema(builder, db);
    return builder;
  }
);

main();
