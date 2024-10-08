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
  root: boolean = false
) {
  const user = args?.["db-user"] || Deno.env.get("MANTLE_DB_USER");
  const password = args?.["db-password"] || Deno.env.get("MANTLE_DB_PASSWORD");
  const host = args?.["db-host"] || Deno.env.get("MANTLE_DB_HOST");
  const port = args?.["db-port"] || Deno.env.get("MANTLE_DB_PORT");
  const name = args?.["db-name"] || Deno.env.get("MANTLE_DB_NAME");
  const adminDbName = args?.["admin-db-name"] || Deno.env.get("MANTLE_ADMIN_DB_NAME") || "postgres";
  if (!user || !password || !host ) {
    throw new Error("Database credentials are not set");
  }
  return `postgres://${user}:${password}@${host}:${port}${name ? `/${root ? adminDbName : name}` : ""}`;
}

export function createConnection(args?: Args, root: boolean = false) {
  const ssl = args?.["db-ssl"] || Deno.env.get("MANTLE_DB_SSL");
  const connectionString = createConnectionString(args, root);
  return new Pool({
    connectionString,
    ssl: ssl ? {
      ca: Deno.readFileSync(ssl)
    } : false
  })
}

export function getDb(args?: Args, root: boolean = false) {
  const connection = createConnection(args, root);
  return { db: drizzle(connection, { logger: true }), connection };
}

export type Db = Awaited<ReturnType<typeof getDb>>["db"];
