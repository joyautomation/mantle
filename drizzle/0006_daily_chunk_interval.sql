-- Set chunk interval to 1 day for faster compression turnaround
-- Previously defaulted to 7 days; daily chunks compress sooner and reduce peak disk usage

SELECT set_chunk_time_interval('history', INTERVAL '1 day');
SELECT set_chunk_time_interval('history_properties', INTERVAL '1 day');
