ALTER TABLE `discovery_conversations` ADD `provider` text DEFAULT 'claude-cli' NOT NULL;--> statement-breakpoint
ALTER TABLE `discovery_conversations` ADD `cli_session_id` text;