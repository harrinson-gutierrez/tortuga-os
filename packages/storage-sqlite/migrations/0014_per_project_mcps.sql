DROP TABLE `mcp_connections`;--> statement-breakpoint
CREATE TABLE `project_mcps` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`transport` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`command` text DEFAULT '' NOT NULL,
	`args_json` text DEFAULT '[]' NOT NULL,
	`env_json` text DEFAULT '{}' NOT NULL,
	`url` text,
	`headers_json` text DEFAULT '{}' NOT NULL,
	`preset_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_mcps_project_idx` ON `project_mcps` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_mcps_project_name_uq` ON `project_mcps` (`project_id`,`name`);
