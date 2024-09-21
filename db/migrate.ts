import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createConnectionString, getDb } from "./db.ts";

const { db, connection } = await getDb();

import postgres from "postgres";
import { Args } from "@std/cli";

const rootConnection = postgres(
  await createConnectionString({} as Args, true),
  { max: 1 },
);

/**
 * Creates the database if it doesn't already exist.
 *
 * This function checks for the existence of the database specified in the DB_NAME
 * environment variable. If the database doesn't exist, it creates it.
 *
 * @throws {Error} If DB_NAME environment variable is not set.
 * @throws {Error} If there's an issue checking or creating the database.
 */
async function createDatabaseIfNotExists() {
  const DB_NAME = Deno.env.get("DB_NAME");
  if (!DB_NAME) {
    throw new Error("DB_NAME is not set");
  }
  try {
    const result = await rootConnection`
      SELECT 1 FROM pg_database WHERE datname = ${DB_NAME}
    `;
    if (result.length === 0) {
      console.log(`Creating database ${DB_NAME}...`);
      await rootConnection.unsafe(`CREATE DATABASE "${DB_NAME}"`);
      console.log(`Database ${DB_NAME} created successfully.`);
    } else {
      console.log(`Database ${DB_NAME} found.`);
    }
  } catch (error) {
    console.error("Error checking/creating database:", error);
  } finally {
    await rootConnection.end();
  }
}

await createDatabaseIfNotExists();
await migrate(db, { migrationsFolder: "./drizzle" });
await connection.end();
