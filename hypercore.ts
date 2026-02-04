import type { Db } from "./db/db.ts";
import { sql } from "drizzle-orm";
import {
  createErrorString,
  createFail,
  createSuccess,
  isSuccess,
  type Result,
} from "@joyautomation/dark-matter";
import { log } from "./log.ts";
import type { getBuilder } from "@joyautomation/conch";
import { GraphQLError } from "graphql";

// Types for storage stats
type TableStorageStats = {
  tableName: string;
  totalBytes: number;
  compressedBytes: number | null;
  uncompressedBytes: number | null;
  compressionRatio: number | null;
};

type StorageStats = {
  hypercoreAvailable: boolean;
  compressionEnabled: boolean;
  tables: TableStorageStats[];
  totalStorageBytes: number;
  totalCompressedBytes: number | null;
  totalUncompressedBytes: number | null;
  overallCompressionRatio: number | null;
};

type CompressionStatus = {
  tableName: string;
  compressionEnabled: boolean;
  policyExists: boolean;
};

/**
 * Check if TimescaleDB compression (hypercore) is available
 */
export async function isHypercoreAvailable(db: Db): Promise<Result<boolean>> {
  try {
    // Check if timescaledb extension is installed and has compression support
    const result = await db.execute(sql`
      SELECT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'timescaledb'
      ) as has_timescaledb
    `);

    if (!result.rows[0]?.has_timescaledb) {
      return createSuccess(false);
    }

    // Check if compression is available (it's part of TimescaleDB)
    // Try to query compression-related catalog
    try {
      await db.execute(sql`
        SELECT 1 FROM timescaledb_information.compression_settings LIMIT 0
      `);
      return createSuccess(true);
    } catch {
      // Compression catalog doesn't exist - older version without compression
      return createSuccess(false);
    }
  } catch (error) {
    return createFail(createErrorString(error));
  }
}

/**
 * Check compression status for a specific table
 */
export async function getCompressionStatus(
  db: Db,
  tableName: string,
): Promise<Result<CompressionStatus>> {
  try {
    // Check if compression is enabled on the hypertable
    const compressionResult = await db.execute(sql.raw(`
      SELECT compression_enabled
      FROM timescaledb_information.hypertables
      WHERE hypertable_name = '${tableName}'
    `));

    const compressionEnabled = compressionResult.rows[0]?.compression_enabled === true;

    // Check if compression policy exists
    const policyResult = await db.execute(sql.raw(`
      SELECT 1
      FROM timescaledb_information.jobs j
      JOIN timescaledb_information.job_stats js ON j.job_id = js.job_id
      WHERE j.proc_name = 'policy_compression'
      AND j.hypertable_name = '${tableName}'
      LIMIT 1
    `));

    const policyExists = (policyResult.rows?.length ?? 0) > 0;

    return createSuccess({
      tableName,
      compressionEnabled,
      policyExists,
    });
  } catch (error) {
    return createFail(createErrorString(error));
  }
}

/**
 * Enable compression on the history table
 */
export async function enableHistoryCompression(db: Db): Promise<Result<void>> {
  try {
    log.info("Enabling compression on history table...");

    await db.execute(sql`
      ALTER TABLE history SET (
        timescaledb.compress,
        timescaledb.compress_segmentby = 'group_id, node_id, device_id, metric_id',
        timescaledb.compress_orderby = 'timestamp DESC NULLS FIRST'
      )
    `);

    log.info("Compression enabled on history table");
    return createSuccess(undefined);
  } catch (error) {
    return createFail(createErrorString(error));
  }
}

/**
 * Enable compression on the history_properties table
 */
export async function enableHistoryPropertiesCompression(db: Db): Promise<Result<void>> {
  try {
    log.info("Enabling compression on history_properties table...");

    await db.execute(sql`
      ALTER TABLE history_properties SET (
        timescaledb.compress,
        timescaledb.compress_segmentby = 'group_id, node_id, device_id, metric_id, property_id',
        timescaledb.compress_orderby = 'timestamp DESC NULLS FIRST'
      )
    `);

    log.info("Compression enabled on history_properties table");
    return createSuccess(undefined);
  } catch (error) {
    return createFail(createErrorString(error));
  }
}

/**
 * Add compression policy for history table (compress chunks older than 1 hour)
 */
export async function addHistoryCompressionPolicy(db: Db): Promise<Result<void>> {
  try {
    log.info("Adding compression policy for history table...");

    await db.execute(sql`
      SELECT add_compression_policy('history', INTERVAL '1 hour')
    `);

    log.info("Compression policy added for history table");
    return createSuccess(undefined);
  } catch (error) {
    // Policy might already exist
    const errorStr = createErrorString(error);
    if (errorStr.includes("already exists")) {
      log.info("Compression policy already exists for history table");
      return createSuccess(undefined);
    }
    return createFail(errorStr);
  }
}

/**
 * Add compression policy for history_properties table (compress chunks older than 24 hours)
 */
export async function addHistoryPropertiesCompressionPolicy(db: Db): Promise<Result<void>> {
  try {
    log.info("Adding compression policy for history_properties table...");

    await db.execute(sql`
      SELECT add_compression_policy('history_properties', INTERVAL '24 hours')
    `);

    log.info("Compression policy added for history_properties table");
    return createSuccess(undefined);
  } catch (error) {
    // Policy might already exist
    const errorStr = createErrorString(error);
    if (errorStr.includes("already exists")) {
      log.info("Compression policy already exists for history_properties table");
      return createSuccess(undefined);
    }
    return createFail(errorStr);
  }
}

/**
 * Initialize hypercore compression on all tables if available
 * This should be called on startup after migrations
 */
export async function initializeHypercore(db: Db): Promise<Result<void>> {
  log.info("Checking hypercore (TimescaleDB compression) availability...");

  const availableResult = await isHypercoreAvailable(db);
  if (!isSuccess(availableResult)) {
    log.warn(`Could not check hypercore availability: ${availableResult.error}`);
    return createFail(availableResult.error);
  }

  if (!availableResult.output) {
    log.info("Hypercore (TimescaleDB compression) is not available");
    return createSuccess(undefined);
  }

  log.info("Hypercore is available, checking compression status...");

  // Check and enable compression on history table
  const historyStatus = await getCompressionStatus(db, "history");
  if (isSuccess(historyStatus)) {
    if (!historyStatus.output.compressionEnabled) {
      const enableResult = await enableHistoryCompression(db);
      if (!isSuccess(enableResult)) {
        log.error(`Failed to enable compression on history: ${enableResult.error}`);
      }
    } else {
      log.info("Compression already enabled on history table");
    }

    if (!historyStatus.output.policyExists) {
      const policyResult = await addHistoryCompressionPolicy(db);
      if (!isSuccess(policyResult)) {
        log.error(`Failed to add compression policy for history: ${policyResult.error}`);
      }
    } else {
      log.info("Compression policy already exists for history table");
    }
  }

  // Check and enable compression on history_properties table
  const propsStatus = await getCompressionStatus(db, "history_properties");
  if (isSuccess(propsStatus)) {
    if (!propsStatus.output.compressionEnabled) {
      const enableResult = await enableHistoryPropertiesCompression(db);
      if (!isSuccess(enableResult)) {
        log.error(`Failed to enable compression on history_properties: ${enableResult.error}`);
      }
    } else {
      log.info("Compression already enabled on history_properties table");
    }

    if (!propsStatus.output.policyExists) {
      const policyResult = await addHistoryPropertiesCompressionPolicy(db);
      if (!isSuccess(policyResult)) {
        log.error(`Failed to add compression policy for history_properties: ${policyResult.error}`);
      }
    } else {
      log.info("Compression policy already exists for history_properties table");
    }
  }

  log.info("Hypercore initialization complete");
  return createSuccess(undefined);
}

/**
 * Get storage statistics including compression info
 */
export async function getStorageStats(db: Db): Promise<Result<StorageStats>> {
  try {
    const availableResult = await isHypercoreAvailable(db);
    const hypercoreAvailable = isSuccess(availableResult) && availableResult.output;

    const tables: TableStorageStats[] = [];
    let compressionEnabled = false;

    if (hypercoreAvailable) {
      // Get detailed compression stats for each hypertable
      const statsResult = await db.execute(sql`
        SELECT
          hypertable_name as table_name,
          total_bytes,
          CASE WHEN compression_enabled THEN
            (SELECT COALESCE(SUM(after_compression_total_bytes), 0)
             FROM timescaledb_information.compressed_chunk_stats
             WHERE hypertable_name = h.hypertable_name)
          ELSE NULL END as compressed_bytes,
          CASE WHEN compression_enabled THEN
            (SELECT COALESCE(SUM(before_compression_total_bytes), 0)
             FROM timescaledb_information.compressed_chunk_stats
             WHERE hypertable_name = h.hypertable_name)
          ELSE NULL END as uncompressed_bytes,
          compression_enabled
        FROM timescaledb_information.hypertables h
        WHERE hypertable_name IN ('history', 'history_properties')
      `);

      for (const row of statsResult.rows) {
        const totalBytes = Number(row.total_bytes) || 0;
        const compressedBytes = row.compressed_bytes !== null ? Number(row.compressed_bytes) : null;
        const uncompressedBytes = row.uncompressed_bytes !== null ? Number(row.uncompressed_bytes) : null;

        let compressionRatio: number | null = null;
        if (compressedBytes !== null && uncompressedBytes !== null && compressedBytes > 0) {
          compressionRatio = uncompressedBytes / compressedBytes;
        }

        if (row.compression_enabled) {
          compressionEnabled = true;
        }

        tables.push({
          tableName: String(row.table_name),
          totalBytes,
          compressedBytes,
          uncompressedBytes,
          compressionRatio,
        });
      }
    } else {
      // Fall back to basic pg_total_relation_size for non-TimescaleDB
      const sizeResult = await db.execute(sql`
        SELECT
          'history' as table_name,
          pg_total_relation_size('history') as total_bytes
        UNION ALL
        SELECT
          'history_properties' as table_name,
          pg_total_relation_size('history_properties') as total_bytes
      `);

      for (const row of sizeResult.rows) {
        tables.push({
          tableName: String(row.table_name),
          totalBytes: Number(row.total_bytes) || 0,
          compressedBytes: null,
          uncompressedBytes: null,
          compressionRatio: null,
        });
      }
    }

    // Calculate totals
    const totalStorageBytes = tables.reduce((sum, t) => sum + t.totalBytes, 0);
    const totalCompressedBytes = tables.every(t => t.compressedBytes !== null)
      ? tables.reduce((sum, t) => sum + (t.compressedBytes ?? 0), 0)
      : null;
    const totalUncompressedBytes = tables.every(t => t.uncompressedBytes !== null)
      ? tables.reduce((sum, t) => sum + (t.uncompressedBytes ?? 0), 0)
      : null;

    let overallCompressionRatio: number | null = null;
    if (totalCompressedBytes !== null && totalUncompressedBytes !== null && totalCompressedBytes > 0) {
      overallCompressionRatio = totalUncompressedBytes / totalCompressedBytes;
    }

    return createSuccess({
      hypercoreAvailable,
      compressionEnabled,
      tables,
      totalStorageBytes,
      totalCompressedBytes,
      totalUncompressedBytes,
      overallCompressionRatio,
    });
  } catch (error) {
    return createFail(createErrorString(error));
  }
}

/**
 * Add hypercore/storage GraphQL schema
 */
export function addHypercoreToSchema(
  builder: ReturnType<typeof getBuilder>,
  db: Db,
) {
  // Table storage stats type
  const TableStorageStatsRef = builder.objectRef<TableStorageStats>("TableStorageStats");
  TableStorageStatsRef.implement({
    fields: (t) => ({
      tableName: t.exposeString("tableName"),
      totalBytes: t.exposeFloat("totalBytes"),
      compressedBytes: t.exposeFloat("compressedBytes", { nullable: true }),
      uncompressedBytes: t.exposeFloat("uncompressedBytes", { nullable: true }),
      compressionRatio: t.exposeFloat("compressionRatio", { nullable: true }),
    }),
  });

  // Storage stats type
  const StorageStatsRef = builder.objectRef<StorageStats>("StorageStats");
  StorageStatsRef.implement({
    fields: (t) => ({
      hypercoreAvailable: t.exposeBoolean("hypercoreAvailable"),
      compressionEnabled: t.exposeBoolean("compressionEnabled"),
      tables: t.field({
        type: [TableStorageStatsRef],
        resolve: (parent) => parent.tables,
      }),
      totalStorageBytes: t.exposeFloat("totalStorageBytes"),
      totalCompressedBytes: t.exposeFloat("totalCompressedBytes", { nullable: true }),
      totalUncompressedBytes: t.exposeFloat("totalUncompressedBytes", { nullable: true }),
      overallCompressionRatio: t.exposeFloat("overallCompressionRatio", { nullable: true }),
    }),
  });

  // Query: hypercoreAvailable
  builder.queryField("hypercoreAvailable", (t) =>
    t.field({
      type: "Boolean",
      description: "Check if TimescaleDB compression (hypercore) is available",
      resolve: async () => {
        const result = await isHypercoreAvailable(db);
        if (isSuccess(result)) {
          return result.output;
        } else {
          throw new GraphQLError(result.error);
        }
      },
    })
  );

  // Query: storageStats
  builder.queryField("storageStats", (t) =>
    t.field({
      type: StorageStatsRef,
      description: "Get storage statistics including compression info",
      resolve: async () => {
        const result = await getStorageStats(db);
        if (isSuccess(result)) {
          return result.output;
        } else {
          throw new GraphQLError(result.error);
        }
      },
    })
  );
}
