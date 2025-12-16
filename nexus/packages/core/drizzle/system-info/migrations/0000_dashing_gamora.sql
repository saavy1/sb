CREATE TABLE `drives` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`label` text NOT NULL,
	`expected_capacity` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `drives_path_unique` ON `drives` (`path`);--> statement-breakpoint
CREATE INDEX `idx_drives_path` ON `drives` (`path`);