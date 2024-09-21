import { parseArguments, printHelp, printVersion } from "./cli.ts";

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
