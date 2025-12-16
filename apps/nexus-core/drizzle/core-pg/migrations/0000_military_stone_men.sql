CREATE SCHEMA "core";
--> statement-breakpoint
CREATE TABLE "core"."jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"payload" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "core"."permissions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "core"."permissions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"discord_id" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"permission" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."users" (
	"discord_id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "core"."permissions" ADD CONSTRAINT "permissions_discord_id_users_discord_id_fk" FOREIGN KEY ("discord_id") REFERENCES "core"."users"("discord_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_jobs_status" ON "core"."jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_jobs_type" ON "core"."jobs" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_permissions_discord_id" ON "core"."permissions" USING btree ("discord_id");