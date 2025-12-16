CREATE SCHEMA "game_servers";
--> statement-breakpoint
CREATE TABLE "game_servers"."servers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"game_type" text DEFAULT 'minecraft' NOT NULL,
	"modpack" text,
	"status" text DEFAULT 'stopped' NOT NULL,
	"port" integer,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"memory" text,
	"k8s_deployment" text,
	CONSTRAINT "servers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE INDEX "idx_servers_name" ON "game_servers"."servers" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_servers_status" ON "game_servers"."servers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_servers_created_by" ON "game_servers"."servers" USING btree ("created_by");