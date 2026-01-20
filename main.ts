import { createApp } from "@joyautomation/conch";
import { argDictionary } from "./cli.ts";
import { log } from "./log.ts";
import { addHistoryEvents, addHostToSchema, getHost } from "./synapse.ts";
import { getDb } from "./db/db.ts";
import { addHistoryToSchema } from "./history.ts";
import {
  getPublisherRetry,
  getSubscriberRetry,
  subscribeToKeys,
} from "./redis.ts";
import { isFail, isSuccess } from "@joyautomation/dark-matter";
import { pubsub } from "./pubsub.ts";
import { addMemoryUsageToSchema } from "./memory.ts";
import type { UMetric } from "sparkplug-payload/lib/sparkplugbpayload.js";

/**
 * Internal utility functions exposed for testing purposes
 * @internal
 */
export const _internal = {
  /** Function to get database connection and Drizzle ORM instance */
  getDb,
  /** Function to create and configure a SparkplugHost instance */
  getHost,
  getPublisherRetry,
  getSubscriberRetry,
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
  true, //add subscriptions
  true, //add mutations
  4001,
  "0.0.0.0",
  log,
  async (builder, args) => {
    const { db } = await _internal.getDb(args);
    const publisherResult = await _internal.getPublisherRetry(args, 5, 1000);
    const subscriberResult = await _internal.getSubscriberRetry(args, 5, 1000);
    const host = _internal.getHost(args);
    if (isSuccess(publisherResult) && isSuccess(subscriberResult)) {
      log.debug(
        `Using key value store at ${publisherResult.output.options?.url}`
      );
      const publisher = publisherResult.output;
      const subscriber = subscriberResult.output;
      addHistoryEvents(db, host, publisher, subscriber);
      addHostToSchema(host, builder, publisher);
      let metricUpdates: UMetric[] = [];
      subscribeToKeys(subscriber, async (key: string, _topic: string) => {
        const value = await publisher.get(key);
        if (value) {
          metricUpdates.push({
            ...JSON.parse(value),
            ...JSON.parse(key),
          });
        }
      });
      setInterval(() => {
        if (metricUpdates.length > 0)
          pubsub.publish("metricUpdate", metricUpdates);
        metricUpdates = [];
      }, 1000);
    } else {
      if (isFail(publisherResult)) log.info(publisherResult.error);
      if (isFail(subscriberResult)) log.info(subscriberResult.error);
      log.debug("Using in-memory database");
      addHistoryEvents(db, host);
      addHostToSchema(host, builder);
    }
    addHistoryToSchema(builder, db);
    addMemoryUsageToSchema(builder);
    return builder;
  }
);

main();
