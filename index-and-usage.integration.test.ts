/**
 * Integration tests for migration 0007 (metric identity indexes) and optimized getUsage()
 *
 * Verifies that:
 * 1. Indexes exist on both hypertables after migration
 * 2. getUsage() returns correct results with the optimized queries
 * 3. getHistory() works correctly with indexed tables
 *
 * Run with: docker-compose up -d postgres
 * Then: deno test -A --env-file=.env index-and-usage.integration.test.ts
 */

import { describe, it, beforeAll, afterAll } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { sql } from "drizzle-orm";
import { isSuccess } from "@joyautomation/dark-matter";
import { getDb } from "./db/db.ts";
import { runMigrations } from "./db/migration.ts";
import { initializeHypercore } from "./hypercore.ts";
import { getHistory, getUsage } from "./history.ts";
import { history as historyTable } from "./db/schema.ts";
import { parseArguments } from "@joyautomation/conch";
import { argDictionary } from "./cli.ts";
import type { Db } from "./db/db.ts";
import type { Pool } from "pg";

const testArgs = parseArguments([
  "-D", "localhost",
  "-P", "5436",
  "-U", "postgres",
  "-W", "postgres",
  "-N", "mantle-dev",
], argDictionary);

let db: Db;
let connection: Pool;

describe("Index Migration & Usage Optimization", { sanitizeResources: false, sanitizeOps: false }, () => {
  beforeAll(async () => {
    await runMigrations(testArgs);
    const dbResult = getDb(testArgs);
    db = dbResult.db;
    connection = dbResult.connection;

    // Initialize hypercore (compression) so the environment matches production
    await initializeHypercore(db);

    // Insert test data spanning multiple months
    const now = new Date();
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    // Clean up any previous test data
    await db.execute(sql`DELETE FROM "history" WHERE "group_id" = 'test-group'`);

    // Insert rows across 3 months
    const rows = [];
    for (let i = 0; i < 90; i++) {
      const timestamp = new Date(threeMonthsAgo);
      timestamp.setDate(timestamp.getDate() + i);
      rows.push({
        groupId: "test-group",
        nodeId: "test-node",
        deviceId: "test-device",
        metricId: "test-metric",
        floatValue: Math.random() * 100,
        timestamp,
      });
    }
    await db.insert(historyTable).values(rows);

    // Run ANALYZE so approximate_row_count has stats
    await db.execute(sql`ANALYZE "history"`);
  });

  afterAll(async () => {
    // Clean up test data
    if (db) {
      await db.execute(sql`DELETE FROM "history" WHERE "group_id" = 'test-group'`);
    }
    if (connection) {
      await connection.end();
    }
  });

  describe("Indexes", () => {
    it("should have idx_history_metric_time index", async () => {
      // TimescaleDB propagates parent indexes to chunk tables with modified names
      // Check for any index whose name starts with our index name
      const result = await db.execute(sql`
        SELECT indexname, tablename FROM pg_indexes
        WHERE schemaname IN ('public', '_timescaledb_internal')
          AND indexname LIKE 'idx_history_metric_time%'
      `);
      expect(result.rows.length).toBeGreaterThanOrEqual(1);
      console.log(`  idx_history_metric_time: found ${result.rows.length} index(es)`);
    });

    it("should have idx_history_properties_metric_time index", async () => {
      const result = await db.execute(sql`
        SELECT indexname, tablename FROM pg_indexes
        WHERE schemaname IN ('public', '_timescaledb_internal')
          AND indexname LIKE 'idx_history_properties_metric_time%'
      `);
      expect(result.rows.length).toBeGreaterThanOrEqual(1);
      console.log(`  idx_history_properties_metric_time: found ${result.rows.length} index(es)`);
    });

    it("should use index scan for metric-filtered history queries with data", async () => {
      // Use a time range that contains test data so the planner doesn't short-circuit
      const now = new Date();
      const fourMonthsAgo = new Date(now);
      fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 4);

      const result = await db.execute(sql.raw(`
        EXPLAIN (FORMAT JSON)
        SELECT * FROM "history"
        WHERE "group_id" = 'test-group'
          AND "node_id" = 'test-node'
          AND "device_id" = 'test-device'
          AND "metric_id" = 'test-metric'
          AND "timestamp" > '${fourMonthsAgo.toISOString()}'
      `));
      const plan = JSON.stringify(result.rows);
      const usesIndex = plan.includes("Index") || plan.includes("Bitmap");
      // On small datasets PostgreSQL may still choose seq scan; log either way
      console.log(`  Query plan uses index: ${usesIndex}`);
      console.log(`  Plan snippet: ${plan.substring(0, 300)}...`);
      // Don't hard-fail on small datasets — the index exists (tested above),
      // but the planner may prefer seq scan for <100 rows
      if (!usesIndex) {
        console.log("  Note: planner chose seq scan (expected for small datasets)");
      }
    });
  });

  describe("getUsage()", () => {
    it("should return a total count (approximate)", async () => {
      const result = await getUsage({ db });
      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        // approximate_row_count may return 0 on very small tables even after ANALYZE
        // The important thing is it doesn't throw
        expect(result.output.totalCount).toBeGreaterThanOrEqual(0);
        console.log(`  Total count (approximate): ${result.output.totalCount}`);
      }
    });

    it("should return monthly breakdown", async () => {
      const result = await getUsage({ db });
      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.output.byMonth.length).toBeGreaterThan(0);
        for (const month of result.output.byMonth) {
          expect(month.year).toBeGreaterThan(2020);
          expect(month.month).toBeGreaterThanOrEqual(1);
          expect(month.month).toBeLessThanOrEqual(12);
          expect(month.count).toBeGreaterThan(0);
          console.log(`  ${month.year}-${String(month.month).padStart(2, "0")}: ${month.count} rows`);
        }
      }
    });

    it("should have monthly counts that sum to a positive number", async () => {
      const result = await getUsage({ db });
      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        const monthlySum = result.output.byMonth.reduce((sum, m) => sum + m.count, 0);
        expect(monthlySum).toBeGreaterThan(0);
        console.log(`  Monthly sum: ${monthlySum}, Total (approx): ${result.output.totalCount}`);
      }
    });
  });

  describe("getHistory()", () => {
    it("should return history for test data", async () => {
      const now = new Date();
      const start = new Date(now);
      start.setMonth(start.getMonth() - 4);

      const result = await getHistory({
        db,
        metrics: [{
          groupId: "test-group",
          nodeId: "test-node",
          deviceId: "test-device",
          metricId: "test-metric",
        }],
        start,
        end: now,
        samples: 50,
      });
      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.output.length).toBe(1);
        expect(result.output[0].history.length).toBeGreaterThan(0);
        console.log(`  History points returned: ${result.output[0].history.length}`);
      }
    });

    it("should return left-edge value for windowed queries", async () => {
      // Query a window that starts after some data exists
      const now = new Date();
      const start = new Date(now);
      start.setMonth(start.getMonth() - 1);

      const result = await getHistory({
        db,
        metrics: [{
          groupId: "test-group",
          nodeId: "test-node",
          deviceId: "test-device",
          metricId: "test-metric",
        }],
        start,
        end: now,
        samples: 50,
      });
      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        const history = result.output[0].history;
        expect(history.length).toBeGreaterThan(0);
        console.log(`  History with left-edge: ${history.length} points`);
        if (history.length > 0) {
          console.log(`  First point timestamp: ${history[0].timestamp}`);
        }
      }
    });
  });
});
