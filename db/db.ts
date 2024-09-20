import { drizzle } from "drizzle-orm/postgres-js";
import { Args } from "@std/cli";
import postgres from "postgres";

/**
 * Creates a PostgreSQL connection string based on environment variables.
 *
 * @param {boolean} [root=false] - If true, connects to the 'postgres' database instead of the application database.
 * @returns {Promise<string>} A promise that resolves to the connection string.
 * @throws {Error} If any required database credentials are not set.
 */
export async function createConnectionString(
  args: Args,
  root: boolean = false,
) {
  console.log(args["db-user"]);
  const user = args["db-user"] || Deno.env.get("MANTLE_DB_USER");
  const password = args["db-password"] || Deno.env.get("MANTLE_DB_PASSWORD");
  const host = args["db-host"] || Deno.env.get("MANTLE_DB_HOST");
  const name = args["db-name"] || Deno.env.get("MANTLE_DB_NAME");
  if (!user || !password || !host || (!name && !root)) {
    throw new Error("Database credentials are not set");
  }
  return `postgres://${user}:${password}@${host}:5432/${
    root ? "postgres" : name
  }`;
}

export async function getDb(args: Args, root: boolean = false) {
  const connection = postgres(
    await createConnectionString(args, root),
    { max: 1 },
  );
  return drizzle(connection);
}

export type Db = Awaited<ReturnType<typeof getDb>>;
