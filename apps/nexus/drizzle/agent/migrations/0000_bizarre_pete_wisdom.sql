CREATE TABLE `agent_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`title` text,
	`source` text NOT NULL,
	`source_id` text,
	`messages` text DEFAULT '[]' NOT NULL,
	`context` text DEFAULT '{}' NOT NULL,
	`wake_job_id` text,
	`wake_reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
