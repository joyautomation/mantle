/**
 * Integration test for chunk interval migration (0006_daily_chunk_interval.sql)
 *
 * Verifies that after running migrations, both hypertables have a 1-day chunk interval.
 * Run with: docker-compose up -d postgres
 * Then: deno test -A chunk-interval.integration.test.ts
 */

import { describe, it, beforeAll, afterAll } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { sql } from "drizzle-orm";
import { getDb } from "./db/db.ts";
import { runMigrations } from "./db/migration.ts";
import { parseArguments } from "@joyautomation/conch";
import { argDictionary } from "./cli.ts";
import type { Db } from "./db/db.ts";
import type { Pool } from "pg";

const testArgs = parseArguments([
  "-D", "localhost",
  "-P", "5436",
  "-U", "postgres",
  "-W", "postgres",
  "-N", "mantle_chunk_test",
], argDictionary);

let db: Db;
let connection: Pool;

describe("Chunk Interval Migration", { sanitizeResources: false, sanitizeOps: false }, () => {
  beforeAll(async () => {
    await runMigrations(testArgs);
    const dbResult = getDb(testArgs);
    db = dbResult.db;
    connection = dbResult.connection;
  });

  afterAll(async () => {
    if (connection) {
      await connection.end();
    }
  });

  it("should set history chunk interval to 1 day", async () => {
    const result = await db.execute(sql`SELECT time_interval FROM timescaledb_information.dimensions WHERE hypertable_name = 'history'`);
    expect(result.rows.length).toBe(1);
    const interval = String((result.rows[0] as Record<string, unknown>).time_interval);
    expect(interval).toContain("1 day");
    console.log(`  history chunk interval: ${interval}`);
  });

  it("should set history_properties chunk interval to 1 day", async () => {
    const result = await db.execute(sql`SELECT time_interval FROM timescaledb_information.dimensions WHERE hypertable_name = 'history_properties'`);
    expect(result.rows.length).toBe(1);
    const interval = String((result.rows[0] as Record<string, unknown>).time_interval);
    expect(interval).toContain("1 day");
    console.log(`  history_properties chunk interval: ${interval}`);
  });
});
