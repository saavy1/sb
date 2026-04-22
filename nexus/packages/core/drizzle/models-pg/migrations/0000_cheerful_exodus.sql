CREATE SCHEMA "models";
--> statement-breakpoint
CREATE TABLE "models"."models" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"hf_repo_id" text NOT NULL,
	"hf_revision" text,
	"runtime" text DEFAULT 'vllm' NOT NULL,
	"served_model_name" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"download_job_name" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"spark_arena_source" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_error" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_started_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "models_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE INDEX "idx_models_name" ON "models"."models" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_models_status" ON "models"."models" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_models_created_by" ON "models"."models" USING btree ("created_by");