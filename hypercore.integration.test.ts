/**
 * Integration tests for hypercore.ts
 *
 * These tests require a running TimescaleDB instance.
 * Run with: docker-compose up -d postgres
 * Then: deno test -A hypercore.integration.test.ts
 */

import { describe, it, beforeAll, afterAll } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { isSuccess, isFail } from "@joyautomation/dark-matter";
import {
  isHypercoreAvailable,
  getCompressionStatus,
  getStorageStats,
  initializeHypercore,
  enableHistoryCompression,
  addHistoryCompressionPolicy,
} from "./hypercore.ts";
import { getDb } from "./db/db.ts";
import { runMigrations } from "./db/migration.ts";
import { parseArguments } from "@joyautomation/conch";
import { argDictionary } from "./cli.ts";
import type { Db } from "./db/db.ts";
import type { Pool } from "pg";

// Test database configuration (matches docker-compose.yml)
const testArgs = parseArguments([
  "-D", "localhost",
  "-P", "5436",
  "-U", "postgres",
  "-W", "postgres",
  "-N", "mantle_test",
], argDictionary);

let db: Db;
let connection: Pool;

// Disable resource sanitization for database integration tests
describe("Hypercore Integration Tests", { sanitizeResources: false, sanitizeOps: false }, () => {
  beforeAll(async () => {
    // Run migrations to ensure tables exist
    try {
      await runMigrations(testArgs);
    } catch (e) {
      console.log("Migration note:", e);
    }

    const dbResult = getDb(testArgs);
    db = dbResult.db;
    connection = dbResult.connection;
  });

  afterAll(async () => {
    if (connection) {
      await connection.end();
    }
  });

  describe("isHypercoreAvailable", () => {
    it("should detect TimescaleDB compression availability", async () => {
      const result = await isHypercoreAvailable(db);

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        // TimescaleDB with compression should be available in timescale/timescaledb image
        expect(typeof result.output).toBe("boolean");
        console.log(`  Hypercore available: ${result.output}`);
      }
    });
  });

  describe("initializeHypercore", () => {
    it("should initialize compression on tables", async () => {
      const result = await initializeHypercore(db);

      expect(isSuccess(result)).toBe(true);
      console.log("  Hypercore initialization complete");
    });
  });

  describe("getCompressionStatus", () => {
    it("should return compression status for history table", async () => {
      const result = await getCompressionStatus(db, "history");

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.output.tableName).toBe("history");
        expect(typeof result.output.compressionEnabled).toBe("boolean");
        expect(typeof result.output.policyExists).toBe("boolean");
        console.log(`  history: compression=${result.output.compressionEnabled}, policy=${result.output.policyExists}`);
      }
    });

    it("should return compression status for history_properties table", async () => {
      const result = await getCompressionStatus(db, "history_properties");

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.output.tableName).toBe("history_properties");
        console.log(`  history_properties: compression=${result.output.compressionEnabled}, policy=${result.output.policyExists}`);
      }
    });
  });

  describe("getStorageStats", () => {
    it("should return storage statistics", async () => {
      const result = await getStorageStats(db);

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(typeof result.output.hypercoreAvailable).toBe("boolean");
        expect(typeof result.output.compressionEnabled).toBe("boolean");
        expect(Array.isArray(result.output.tables)).toBe(true);
        expect(typeof result.output.totalStorageBytes).toBe("number");

        console.log(`  Storage Stats:`);
        console.log(`    Hypercore available: ${result.output.hypercoreAvailable}`);
        console.log(`    Compression enabled: ${result.output.compressionEnabled}`);
        console.log(`    Total storage: ${(result.output.totalStorageBytes / 1024).toFixed(2)} KB`);

        for (const table of result.output.tables) {
          console.log(`    ${table.tableName}:`);
          console.log(`      Total: ${(table.totalBytes / 1024).toFixed(2)} KB`);
          if (table.compressionRatio !== null) {
            console.log(`      Compression ratio: ${table.compressionRatio.toFixed(2)}x`);
          }
        }

        if (result.output.overallCompressionRatio !== null) {
          console.log(`    Overall compression ratio: ${result.output.overallCompressionRatio.toFixed(2)}x`);
        }
      }
    });
  });
});
