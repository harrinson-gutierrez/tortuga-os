CREATE TABLE `task_conversations` (
  `id` text PRIMARY KEY NOT NULL,
  `task_id` text NOT NULL,
  `status` text DEFAULT 'active' NOT NULL,
  `provider` text DEFAULT 'claude-cli' NOT NULL,
  `cli_session_id` text,
  `phase` text DEFAULT 'planning' NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `task_messages` (
  `id` text PRIMARY KEY NOT NULL,
  `conversation_id` text NOT NULL,
  `role` text NOT NULL,
  `content` text NOT NULL,
  `agent_run_id` text,
  `phase` text,
  `model` text,
  `tokens_in` integer DEFAULT 0 NOT NULL,
  `tokens_out` integer DEFAULT 0 NOT NULL,
  `cost_cents` integer DEFAULT 0 NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`conversation_id`) REFERENCES `task_conversations`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`agent_run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `task_conversations_task_idx` ON `task_conversations` (`task_id`);--> statement-breakpoint
CREATE INDEX `task_messages_conversation_idx` ON `task_messages` (`conversation_id`);--> statement-breakpoint
ALTER TABLE `tasks` ADD `execution_mode` text DEFAULT 'coworker' NOT NULL;
