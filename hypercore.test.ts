import { describe, it, beforeEach, afterEach } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { stub, type Stub } from "@std/testing/mock";
import { createSuccess, createFail, isSuccess } from "@joyautomation/dark-matter";
import {
  isHypercoreAvailable,
  getCompressionStatus,
  getStorageStats,
  initializeHypercore,
  enableHistoryCompression,
  enableHistoryPropertiesCompression,
  addHistoryCompressionPolicy,
  addHistoryPropertiesCompressionPolicy,
} from "./hypercore.ts";
import type { Db } from "./db/db.ts";

// Helper to create a mock db
function createMockDb() {
  return {
    execute: () => Promise.resolve({ rows: [] }),
  } as unknown as Db;
}

describe("isHypercoreAvailable", () => {
  it("should return false when timescaledb extension is not installed", async () => {
    const mockDb = createMockDb();
    const executeStub = stub(mockDb, "execute", () =>
      Promise.resolve({ rows: [{ has_timescaledb: false }] })
    );

    const result = await isHypercoreAvailable(mockDb);

    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.output).toBe(false);
    }

    executeStub.restore();
  });

  it("should return true when timescaledb with compression is available", async () => {
    const mockDb = createMockDb();
    let callCount = 0;
    const executeStub = stub(mockDb, "execute", () => {
      callCount++;
      if (callCount === 1) {
        // First call: check extension
        return Promise.resolve({ rows: [{ has_timescaledb: true }] });
      } else {
        // Second call: check compression catalog
        return Promise.resolve({ rows: [] });
      }
    });

    const result = await isHypercoreAvailable(mockDb);

    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.output).toBe(true);
    }

    executeStub.restore();
  });

  it("should return false when compression catalog doesn't exist", async () => {
    const mockDb = createMockDb();
    let callCount = 0;
    const executeStub = stub(mockDb, "execute", () => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ rows: [{ has_timescaledb: true }] });
      } else {
        // Compression catalog query fails
        return Promise.reject(new Error("relation does not exist"));
      }
    });

    const result = await isHypercoreAvailable(mockDb);

    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.output).toBe(false);
    }

    executeStub.restore();
  });

  it("should return fail on database error", async () => {
    const mockDb = createMockDb();
    const executeStub = stub(mockDb, "execute", () =>
      Promise.reject(new Error("Connection refused"))
    );

    const result = await isHypercoreAvailable(mockDb);

    expect(isSuccess(result)).toBe(false);

    executeStub.restore();
  });
});

describe("getCompressionStatus", () => {
  it("should return compression enabled status", async () => {
    const mockDb = createMockDb();
    let callCount = 0;
    const executeStub = stub(mockDb, "execute", () => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ rows: [{ compression_enabled: true }] });
      } else {
        return Promise.resolve({ rows: [{ "?column?": 1 }] });
      }
    });

    const result = await getCompressionStatus(mockDb, "history");

    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.output.tableName).toBe("history");
      expect(result.output.compressionEnabled).toBe(true);
      expect(result.output.policyExists).toBe(true);
    }

    executeStub.restore();
  });

  it("should return false when compression not enabled", async () => {
    const mockDb = createMockDb();
    let callCount = 0;
    const executeStub = stub(mockDb, "execute", () => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ rows: [{ compression_enabled: false }] });
      } else {
        return Promise.resolve({ rows: [] });
      }
    });

    const result = await getCompressionStatus(mockDb, "history");

    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.output.compressionEnabled).toBe(false);
      expect(result.output.policyExists).toBe(false);
    }

    executeStub.restore();
  });
});

describe("getStorageStats", () => {
  it("should return storage stats when hypercore is available", async () => {
    const mockDb = createMockDb();
    let callCount = 0;
    const executeStub = stub(mockDb, "execute", () => {
      callCount++;
      if (callCount <= 2) {
        // isHypercoreAvailable checks
        if (callCount === 1) {
          return Promise.resolve({ rows: [{ has_timescaledb: true }] });
        }
        return Promise.resolve({ rows: [] }); // compression catalog exists
      } else {
        // Storage stats query
        return Promise.resolve({
          rows: [
            {
              table_name: "history",
              total_bytes: 1000000,
              compressed_bytes: 100000,
              uncompressed_bytes: 900000,
              compression_enabled: true,
            },
            {
              table_name: "history_properties",
              total_bytes: 500000,
              compressed_bytes: 50000,
              uncompressed_bytes: 450000,
              compression_enabled: true,
            },
          ],
        });
      }
    });

    const result = await getStorageStats(mockDb);

    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.output.hypercoreAvailable).toBe(true);
      expect(result.output.compressionEnabled).toBe(true);
      expect(result.output.tables.length).toBe(2);
      expect(result.output.totalStorageBytes).toBe(1500000);
    }

    executeStub.restore();
  });

  it("should return basic stats when hypercore is not available", async () => {
    const mockDb = createMockDb();
    let callCount = 0;
    const executeStub = stub(mockDb, "execute", () => {
      callCount++;
      if (callCount === 1) {
        // No timescaledb
        return Promise.resolve({ rows: [{ has_timescaledb: false }] });
      } else {
        // Basic size query
        return Promise.resolve({
          rows: [
            { table_name: "history", total_bytes: 1000000 },
            { table_name: "history_properties", total_bytes: 500000 },
          ],
        });
      }
    });

    const result = await getStorageStats(mockDb);

    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.output.hypercoreAvailable).toBe(false);
      expect(result.output.compressionEnabled).toBe(false);
      expect(result.output.tables.length).toBe(2);
      expect(result.output.tables[0].compressedBytes).toBe(null);
    }

    executeStub.restore();
  });
});

describe("enableHistoryCompression", () => {
  it("should execute ALTER TABLE statement", async () => {
    const mockDb = createMockDb();
    const executeStub = stub(mockDb, "execute", () =>
      Promise.resolve({ rows: [] })
    );

    const result = await enableHistoryCompression(mockDb);

    expect(isSuccess(result)).toBe(true);
    expect(executeStub.calls.length).toBe(1);

    executeStub.restore();
  });

  it("should return fail on error", async () => {
    const mockDb = createMockDb();
    const executeStub = stub(mockDb, "execute", () =>
      Promise.reject(new Error("Permission denied"))
    );

    const result = await enableHistoryCompression(mockDb);

    expect(isSuccess(result)).toBe(false);

    executeStub.restore();
  });
});

describe("enableHistoryPropertiesCompression", () => {
  it("should execute ALTER TABLE statement", async () => {
    const mockDb = createMockDb();
    const executeStub = stub(mockDb, "execute", () =>
      Promise.resolve({ rows: [] })
    );

    const result = await enableHistoryPropertiesCompression(mockDb);

    expect(isSuccess(result)).toBe(true);
    expect(executeStub.calls.length).toBe(1);

    executeStub.restore();
  });
});

describe("addHistoryCompressionPolicy", () => {
  it("should add compression policy", async () => {
    const mockDb = createMockDb();
    const executeStub = stub(mockDb, "execute", () =>
      Promise.resolve({ rows: [] })
    );

    const result = await addHistoryCompressionPolicy(mockDb);

    expect(isSuccess(result)).toBe(true);

    executeStub.restore();
  });

  it("should succeed if policy already exists", async () => {
    const mockDb = createMockDb();
    const executeStub = stub(mockDb, "execute", () =>
      Promise.reject(new Error("compression policy already exists"))
    );

    const result = await addHistoryCompressionPolicy(mockDb);

    expect(isSuccess(result)).toBe(true);

    executeStub.restore();
  });

  it("should fail on other errors", async () => {
    const mockDb = createMockDb();
    const executeStub = stub(mockDb, "execute", () =>
      Promise.reject(new Error("Unknown error"))
    );

    const result = await addHistoryCompressionPolicy(mockDb);

    expect(isSuccess(result)).toBe(false);

    executeStub.restore();
  });
});

describe("addHistoryPropertiesCompressionPolicy", () => {
  it("should add compression policy", async () => {
    const mockDb = createMockDb();
    const executeStub = stub(mockDb, "execute", () =>
      Promise.resolve({ rows: [] })
    );

    const result = await addHistoryPropertiesCompressionPolicy(mockDb);

    expect(isSuccess(result)).toBe(true);

    executeStub.restore();
  });
});

describe("initializeHypercore", () => {
  it("should skip initialization when hypercore not available", async () => {
    const mockDb = createMockDb();
    const executeStub = stub(mockDb, "execute", () =>
      Promise.resolve({ rows: [{ has_timescaledb: false }] })
    );

    const result = await initializeHypercore(mockDb);

    expect(isSuccess(result)).toBe(true);
    // Only one call to check availability
    expect(executeStub.calls.length).toBe(1);

    executeStub.restore();
  });
});
