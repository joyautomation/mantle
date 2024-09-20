-- Custom SQL migration file, put you code below! --

-- Create Hypertable
SELECT create_hypertable('history', 'timestamp');