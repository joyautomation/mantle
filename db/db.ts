import { drizzle } from "drizzle-orm/node-postgres";
import type { Args } from "@std/cli";
import pg from "pg";
const { Pool } = pg;

/**
 * Creates a PostgreSQL connection string based on environment variables or CLI arguments.
 *
 * @param {Args} [args] - Optional CLI arguments that may contain database configuration.
 * @param {boolean} [root=false] - If true, connects to the 'postgres' database instead of the application database.
 * @returns {string} The constructed connection string.
 * @throws {Error} If any required database credentials are not set.
 */
export function createConnectionString(
  args?: Args,
  root: boolean = false,
) {
  const user = args?.["db-user"] || Deno.env.get("MANTLE_DB_USER");
  const password = args?.["db-password"] || Deno.env.get("MANTLE_DB_PASSWORD");
  const host = args?.["db-host"] || Deno.env.get("MANTLE_DB_HOST");
  const port = args?.["db-port"] || Deno.env.get("MANTLE_DB_PORT");
  const name = args?.["db-name"] || Deno.env.get("MANTLE_DB_NAME");
  const ssl = args?.["db-ssl"] || Deno.env.get("MANTLE_DB_SSL") || false;
  if (!user || !password || !host || (!name && !root)) {
    throw new Error("Database credentials are not set");
  }
  return `postgres://${user}:${password}@${host}:${port}/${
    root ? "defaultdb" : name
  }`;
}

export function createConnectionOptions(
  args?: Args,
  root: boolean = false,
) {
  return {
    user: args?.["db-user"] || Deno.env.get("MANTLE_DB_USER"),
    password: args?.["db-password"] || Deno.env.get("MANTLE_DB_PASSWORD"),
    host: args?.["db-host"] || Deno.env.get("MANTLE_DB_HOST"),
    port: args?.["db-port"] || Deno.env.get("MANTLE_DB_PORT"),
    name: root ? "defaultdb" : args?.["db-name"] || Deno.env.get("MANTLE_DB_NAME"),
    ssl: (args?.["db-ssl"] || Deno.env.get("MANTLE_DB_SSL") || false) ? 'require' : false,
  };
}

export function getDb(args?: Args, root: boolean = false) {
  // const connectionString = await createConnectionString(args, root);
  // console.log(connectionString);
  // const connection = postgres(
  //   connectionString,
  //   { max: 1, connect_timeout: 60, ssl: 'require' },
  // );
  const connection = new Pool({
    connectionString: createConnectionString(args, root)
  })
  // console.log(connection);
  return { db: drizzle(connection, { logger: true }), connection };
}

export type Db = Awaited<ReturnType<typeof getDb>>["db"];
