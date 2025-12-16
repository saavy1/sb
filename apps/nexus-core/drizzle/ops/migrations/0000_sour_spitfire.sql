CREATE TABLE `operations` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`triggered_by` text NOT NULL,
	`triggered_by_user` text,
	`output` text,
	`error_message` text,
	`started_at` text NOT NULL,
	`completed_at` text,
	`duration_ms` integer
);
