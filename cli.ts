import { Args, parseArgs } from "@std/cli";

/**
 * Prints the current version of squid to the console.
 */
export function printVersion(): void {
  console.log(`mantle v0.0.0`);
}

/**
 * Prints the help message for squid, including usage instructions and available options.
 */
export function printHelp(): void {
  console.log(`Usage: mantle [OPTIONS...]

Optional Flags:
  -b, --broker-url         Set the URL for MQTT Broker (i.e. https://mqtt3.anywherescada.com:8883)
  -u, --username          Set the username for MQTT Broker
  -p, --password          Set the password for MQTT Broker
  -c, --client-id          Set the MQTT Client ID (a random ID will be appended to this)
  -l, --log-level          Set the log level (default: info)
  -D, --db-host      Set the database host (default: localhost)
  -U, --db-user      Set the database user (default: postgres)
  -P, --db-password  Set the database password (default: postgres)
  -N, --db-name      Set the database name (default: mantl)
  -h, --help              Show help
  -v, --version           Show version

Note: If not provided, these options can also be set by the corresponding environment variables:
  MANTLE_MQTT_BROKER_URL, MANTLE_MQTT_USERNAME, MANTLE_MQTT_PASSWORD,
  MANTLE_MQTT_GROUP_ID, MANTLE_MQTT_NODE_ID, MANTLE_MQTT_CLIENT_ID,
  MANTLE_DATABASE_HOST, MANTLE_DATABASE_USER, MANTLE_DATABASE_PASSWORD,
  MANTLE_DATABASE_NAME`);
}

export type ArgDictionaryItem = {
  short: string;
  type: "boolean" | "string";
};

/**
 * A dictionary of command-line arguments and their properties.
 * @type {Object.<string, ArgDictionaryItem>}
 */
export const argDictionary: { [key: string]: ArgDictionaryItem } = {
  help: {
    short: "h",
    type: "boolean",
  },
  version: {
    short: "v",
    type: "boolean",
  },
  "log-level": {
    short: "l",
    type: "string",
  },
  "broker-url": {
    short: "b",
    type: "string",
  },
  username: {
    short: "u",
    type: "string",
  },
  password: {
    short: "p",
    type: "string",
  },
  "client-id": {
    short: "c",
    type: "string",
  },
  "db-host": {
    short: "D",
    type: "string",
  },
  "db-user": {
    short: "U",
    type: "string",
  },
  "db-password": {
    short: "P",
    type: "string",
  },
  "db-name": {
    short: "N",
    type: "string",
  },
};

/**
 * Filters and returns argument keys from the argDictionary based on the specified type.
 * @param {Object.<string, ArgDictionaryItem>} argDictionary - An object containing argument definitions.
 * @param {"boolean" | "string"} argType - The type of arguments to filter.
 * @returns {string[]} An array of argument keys matching the specified type.
 */
export function getArgsFromType(
  argDictionary: { [key: string]: ArgDictionaryItem },
  argType: "boolean" | "string",
): string[] {
  return Object.entries(argDictionary).filter(([key, value]) =>
    value.type === argType
  ).map(([key]) => key);
}

/**
 * Parses command-line arguments into a structured Args object.
 * @param {string[]} args - An array of command-line argument strings.
 * @returns {Args} An object containing parsed arguments.
 */
export function parseArguments(args: string[]): Args {
  const booleanArgs = getArgsFromType(argDictionary, "boolean");
  const stringArgs = getArgsFromType(argDictionary, "string");
  return parseArgs(args, {
    alias: Object.fromEntries(
      Object.entries(argDictionary).map(([key, value]) => [key, value.short]),
    ),
    boolean: booleanArgs,
    string: stringArgs,
    "--": true,
  });
}
