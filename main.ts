import { type Args, parseArgs } from "@std/cli";

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
  -b, --brokerUrl     Set the URL for MQTT Broker (i.e. https://mqtt3.anywherescada.com:8883)
  -u, --username      Set the username for MQTT Broker
  -p, --password      Set the password for MQTT Broker
  -g, --groupId       Set the Sparkplug B Group ID
  -n, --nodeId        Set the Sparkplug B Node ID
  -c, --clientId      Set the MQTT Client ID (a random ID will be appended to this)
  -l, --logLevel      Set the log level (default: info)
  -h, --help          Show help
  -v, --version       Show version

Note: If not provided, these options can also be set by the corresponding environment variables:
  MANTLE_MQTT_BROKER_URL, MANTLE_MQTT_USERNAME, MANTLE_MQTT_PASSWORD,
  MANTLE_MQTT_GROUP_ID, MANTLE_MQTT_NODE_ID, MANTLE_MQTT_CLIENT_ID`);
}

type ArgDictionaryItem = {
  short: string;
  type: "boolean" | "string";
};

/**
 * A dictionary of command-line arguments and their properties.
 * @type {Object.<string, ArgDictionaryItem>}
 */
const argDictionary: { [key: string]: ArgDictionaryItem } = {
  help: {
    short: "h",
    type: "boolean",
  },
  version: {
    short: "v",
    type: "boolean",
  },
  rbeLogLevel: {
    short: "r",
    type: "boolean",
  },
  logLevel: {
    short: "l",
    type: "string",
  },
  brokerUrl: {
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
  groupId: {
    short: "g",
    type: "string",
  },
  nodeId: {
    short: "n",
    type: "string",
  },
  clientId: {
    short: "c",
    type: "string",
  },
};

/**
 * Filters and returns argument keys from the argDictionary based on the specified type.
 * @param {Object.<string, ArgDictionaryItem>} argDictionary - An object containing argument definitions.
 * @param {"boolean" | "string"} argType - The type of arguments to filter.
 * @returns {string[]} An array of argument keys matching the specified type.
 */
function getArgsFromType(
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
function parseArguments(args: string[]): Args {
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

/**
 * The main function that runs the Squid application.
 * It parses command-line arguments, handles help and version flags,
 * and starts the server if no special flags are provided.
 * we use dynamic import to defer the server start until we have parsed the arguments
 * this prevents the SparkplugNode from being created if we're not going to run the server yet
 * @async
 * @returns {Promise<void>}
 */
async function main(): Promise<void> {
  const args = parseArguments(Deno.args);
  if (args.help) {
    printHelp();
    Deno.exit(0);
  }
  if (args.version) {
    printVersion();
    Deno.exit(0);
  }
  const { runServer } = await import("./server.ts");
  runServer(args);
}

main();
