CREATE SCHEMA "apps";
--> statement-breakpoint
CREATE TABLE "apps"."apps" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"icon" text,
	"category" text DEFAULT 'other' NOT NULL,
	"health_check_url" text,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
