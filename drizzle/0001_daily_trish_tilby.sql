-- Custom SQL migration file, put you code below! --

-- Install TimescaleDB extension if not installed
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Create Hypertable
SELECT create_hypertable('history', 'timestamp');