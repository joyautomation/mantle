-- Custom SQL migration file, put your code below! --

SELECT create_hypertable('history_properties', 'timestamp');