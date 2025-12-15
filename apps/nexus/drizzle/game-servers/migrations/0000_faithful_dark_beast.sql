CREATE TABLE `servers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`game_type` text DEFAULT 'minecraft' NOT NULL,
	`modpack` text,
	`status` text DEFAULT 'stopped' NOT NULL,
	`port` integer,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`memory` text,
	`k8s_deployment` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `servers_name_unique` ON `servers` (`name`);--> statement-breakpoint
CREATE INDEX `idx_servers_name` ON `servers` (`name`);--> statement-breakpoint
CREATE INDEX `idx_servers_status` ON `servers` (`status`);--> statement-breakpoint
CREATE INDEX `idx_servers_created_by` ON `servers` (`created_by`);