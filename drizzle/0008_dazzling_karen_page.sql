CREATE TABLE "alarm_history" (
	"id" text PRIMARY KEY NOT NULL,
	"rule_id" text NOT NULL,
	"from_state" text NOT NULL,
	"to_state" text NOT NULL,
	"value" text,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alarm_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"node_id" text NOT NULL,
	"device_id" text DEFAULT '' NOT NULL,
	"metric_id" text NOT NULL,
	"name" text NOT NULL,
	"rule_type" text NOT NULL,
	"threshold" real,
	"delay_sec" bigint DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alarm_state" (
	"rule_id" text PRIMARY KEY NOT NULL,
	"state" text DEFAULT 'normal' NOT NULL,
	"condition_met_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"last_notified_at" timestamp with time zone,
	"last_value" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alarm_history" ADD CONSTRAINT "alarm_history_rule_id_alarm_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."alarm_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alarm_state" ADD CONSTRAINT "alarm_state_rule_id_alarm_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."alarm_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_alarm_history_rule_time" ON "alarm_history" USING btree ("rule_id","timestamp");--> statement-breakpoint
CREATE INDEX "idx_alarm_rules_metric" ON "alarm_rules" USING btree ("group_id","node_id","device_id","metric_id");