import { type ArgDictionaryItem, createMain } from "@joyautomation/conch";
import { runServer } from "./server.ts";

/**
 * A dictionary of command-line arguments and their properties.
 * @type {Object.<string, ArgDictionaryItem>}
 */
export const argDictionary: { [key: string]: ArgDictionaryItem } = {
  migrate: {
    short: "m",
    description: "Run the database migrations",
    action: async () => {
      const { runMigrations } = await import("./db/migration.ts");
      await runMigrations();
    },
    exit: true,
    type: "boolean",
  },
  "broker-url": {
    short: "b",
    description: "Set the URL for MQTT Broker",
    env: "MANTLE_MQTT_BROKER_URL",
    type: "string",
  },
  username: {
    short: "u",
    description: "Set the username for MQTT Broker",
    env: "MANTLE_MQTT_USERNAME",
    type: "string",
  },
  password: {
    short: "p",
    description: "Set the password for MQTT Broker",
    env: "MANTLE_MQTT_PASSWORD",
    type: "string",
  },
  "client-id": {
    short: "c",
    description: "Set the MQTT Client ID",
    env: "MANTLE_MQTT_CLIENT_ID",
    type: "string",
  },
  "db-host": {
    short: "D",
    description: "Set the database host",
    env: "MANTLE_DB_HOST",
    type: "string",
  },
  "db-port": {
    short: "P",
    description: "Set the database port",
    env: "MANTLE_DB_PORT",
    type: "string",
  },
  "db-user": {
    short: "U",
    description: "Set the database user",
    env: "MANTLE_DB_USER",
    type: "string",
  },
  "db-password": {
    short: "W",
    description: "Set the database password",
    env: "MANTLE_DB_PASSWORD",
    type: "string",
  },
  "db-name": {
    short: "N",
    description: "Set the database name",
    env: "MANTLE_DB_NAME",
    type: "string",
  },
  "db-ssl": {
    short: "S",
    description: "Set the database SSL mode",
    env: "MANTLE_DB_SSL",
    type: "boolean",
  },
};

/**
 * The main function that runs the mantle application.
 * @async
 * @returns {Promise<void>}
 */
export const main = createMain(
  "mantle",
  "Mantle, an MQTT Sparkplug B data aggregator and historian.",
  "MANTLE",
  argDictionary,
  runServer,
  false, //don't add mutations
  true, //add subscriptions
);
