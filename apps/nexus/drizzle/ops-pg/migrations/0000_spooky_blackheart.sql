CREATE SCHEMA "ops";
--> statement-breakpoint
CREATE TABLE "ops"."operations" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"triggered_by" text NOT NULL,
	"triggered_by_user" text,
	"output" text,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"duration_ms" integer
);
