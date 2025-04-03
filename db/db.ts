import { drizzle } from "drizzle-orm/node-postgres";
import type { Args } from "@std/cli";
//@deno-types="@types/pg"
import pg from "pg";
import { validateSslCa } from "../validation.ts";
const { Pool } = pg;

export function createConnectionString(args?: Args, root: boolean = false) {
  const user = args?.["db-user"] || Deno.env.get("MANTLE_DB_USER");
  const password = args?.["db-password"] || Deno.env.get("MANTLE_DB_PASSWORD");
  const host = args?.["db-host"] || Deno.env.get("MANTLE_DB_HOST");
  const port = args?.["db-port"] || Deno.env.get("MANTLE_DB_PORT");
  const name = args?.["db-name"] || Deno.env.get("MANTLE_DB_NAME");
  const adminDbName = args?.["admin-db-name"] ||
    Deno.env.get("MANTLE_ADMIN_DB_NAME") ||
    "postgres";
  if (!user || !password || !host || (!root && !name)) {
    throw new Error("Database credentials are not set");
  }
  return `postgres://${user}:${password}@${host}:${port}${
    name ? `/${root ? adminDbName : name}` : ""
  }`;
}

export function createConnection(args?: Args, root: boolean = false) {
  const ssl = args?.["db-ssl"] || Deno.env.get("MANTLE_DB_SSL") === "true";
  const ca = validateSslCa(
    args?.["db-ssl-ca"] || Deno.env.get("MANTLE_DB_SSL_CA"),
  );
  const connectionString = createConnectionString(args, root);
  return new Pool({
    connectionString,
    ssl: ssl && ca
      ? {
        ca,
        rejectUnauthorized: false,
      }
      : ssl,
  });
}

export function getDb(args?: Args, root: boolean = false) {
  const connection = createConnection(args, root);
  return { db: drizzle(connection, { logger: false }), connection };
}

export type Db = Awaited<ReturnType<typeof getDb>>["db"];
