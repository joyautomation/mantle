import type { ArgDictionaryItem } from "@joyautomation/conch";
import type { Args } from "@std/cli";
import { setLogLevel } from "@joyautomation/coral";
import { logs } from "./log.ts";

/**
 * A dictionary of command-line arguments and their properties.
 * @type {Object.<string, ArgDictionaryItem>}
 */
export const argDictionary: Record<string, ArgDictionaryItem> = {
  log_level: {
    short: "l",
    type: "string",
    description: "Set the log level",
    env: "MANTLE_LOG_LEVEL",
    action: (args?: Args) => {
      setLogLevel(logs.synapse.main, args?.["log_level"]);
      setLogLevel(logs.mantle.main, args?.["log_level"]);
    },
  },
  migrate: {
    short: "m",
    description: "Run the database migrations",
    action: async (args?: Args) => {
      const { runMigrations } = await import("./db/migration.ts");
      await runMigrations(args);
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
  "db-admin-name": {
    short: "A",
    description: "Set the database admin name",
    env: "MANTLE_DB_ADMIN_NAME",
    type: "string",
  },
  "db-admin-password": {
    short: "W",
    description: "Set the database admin password",
    env: "MANTLE_DB_ADMIN_PASSWORD",
    type: "string",
  },
  "db-ssl": {
    short: "S",
    description: "SSL mode for database connection",
    env: "MANTLE_DB_SSL",
    type: "boolean",
  },
  "db-ssl-ca": {
    short: "C",
    description: "Path to the root certificate for the database SSL connection",
    env: "MANTLE_DB_SSL_CA",
    type: "string",
  },
  "shared-group": {
    short: "g",
    description: "Shared subscription group for DDATA and NDATA messages",
    env: "MANTLE_SHARED_GROUP",
    type: "string",
  },
  "redis-url": {
    short: "R",
    description: "Redis URL",
    env: "MANTLE_REDIS_URL",
    type: "string",
  },
};
