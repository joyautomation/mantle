CREATE TABLE IF NOT EXISTS "history" (
	"group_id" text NOT NULL,
	"node_id" text NOT NULL,
	"device_id" text DEFAULT '',
	"metric_id" text NOT NULL,
	"int_value" integer,
	"float_value" real,
	"string_value" text,
	"bool_value" boolean,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "history_group_id_node_id_device_id_metric_id_timestamp_unique" UNIQUE("group_id","node_id","device_id","metric_id","timestamp")
);