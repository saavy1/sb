CREATE SCHEMA "system_info";
--> statement-breakpoint
CREATE TABLE "system_info"."drives" (
	"id" text PRIMARY KEY NOT NULL,
	"path" text NOT NULL,
	"label" text NOT NULL,
	"expected_capacity" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drives_path_unique" UNIQUE("path")
);
--> statement-breakpoint
CREATE INDEX "idx_drives_path" ON "system_info"."drives" USING btree ("path");