import { drizzle } from "drizzle-orm/postgres-js";
import type { Args } from "@std/cli";
import postgres from "postgres";

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
  if (!user || !password || !host || (!name && !root)) {
    throw new Error("Database credentials are not set");
  }
  return `postgres://${user}:${password}@${host}:${port}/${
    root ? "postgres" : name
  }`;
}

export async function getDb(args?: Args, root: boolean = false) {
  const connection = postgres(
    await createConnectionString(args, root),
    { max: 1 },
  );
  return { db: drizzle(connection), connection };
}

export type Db = Awaited<ReturnType<typeof getDb>>["db"];
