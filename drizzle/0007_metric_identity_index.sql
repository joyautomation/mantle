-- Add composite indexes for efficient metric-based queries
-- Without these, every history/usage query does sequential scans within chunks
-- The index covers: WHERE (group_id, node_id, device_id, metric_id) filtering
-- and ORDER BY timestamp DESC for left-edge lookups

CREATE INDEX IF NOT EXISTS idx_history_metric_time
  ON history (group_id, node_id, device_id, metric_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_history_properties_metric_time
  ON history_properties (group_id, node_id, device_id, metric_id, property_id, timestamp DESC);
