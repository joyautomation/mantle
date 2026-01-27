CREATE TABLE "hidden_items" (
	"group_id" text NOT NULL,
	"node_id" text NOT NULL,
	"device_id" text DEFAULT '' NOT NULL,
	"metric_id" text DEFAULT '' NOT NULL,
	"hidden_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hidden_items_group_id_node_id_device_id_metric_id_pk" PRIMARY KEY("group_id","node_id","device_id","metric_id")
);
