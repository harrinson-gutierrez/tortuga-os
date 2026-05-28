CREATE TABLE `mcp_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`transport` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`command` text DEFAULT '' NOT NULL,
	`args_json` text DEFAULT '[]' NOT NULL,
	`env_json` text DEFAULT '{}' NOT NULL,
	`url` text,
	`headers_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mcp_connections_name_unique` ON `mcp_connections` (`name`);