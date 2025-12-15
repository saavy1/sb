CREATE SCHEMA "agent";
--> statement-breakpoint
CREATE TABLE "agent"."threads" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"title" text,
	"source" text NOT NULL,
	"source_id" text,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"wake_job_id" text,
	"wake_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
