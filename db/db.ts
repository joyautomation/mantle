import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

/**
 * Creates a PostgreSQL connection string based on environment variables.
 *
 * @param {boolean} [root=false] - If true, connects to the 'postgres' database instead of the application database.
 * @returns {Promise<string>} A promise that resolves to the connection string.
 * @throws {Error} If any required database credentials are not set.
 */
export async function createConnectionString(root: boolean = false) {
  const { DB_USER, DB_PASSWORD, DB_HOST, DB_NAME } = Deno.env.toObject();
  if (!DB_USER || !DB_PASSWORD || !DB_HOST || (!DB_NAME && !root)) {
    throw new Error("Database credentials are not set");
  }
  return `postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:5432/${
    root ? "postgres" : DB_NAME
  }`;
}

export const connection = postgres(
  await createConnectionString(),
  { max: 1 },
);

export const db = drizzle(connection);
