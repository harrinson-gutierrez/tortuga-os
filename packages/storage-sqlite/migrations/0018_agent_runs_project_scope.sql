PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_agent_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `task_id` text,
  `iteration_id` text,
  `project_id` text,
  `agent_kind` text NOT NULL,
  `provider` text NOT NULL,
  `model` text NOT NULL,
  `status` text DEFAULT 'queued' NOT NULL,
  `system_prompt` text NOT NULL,
  `user_prompt` text NOT NULL,
  `output` text,
  `error_message` text,
  `tokens_in` integer DEFAULT 0 NOT NULL,
  `tokens_out` integer DEFAULT 0 NOT NULL,
  `cost_cents` integer DEFAULT 0 NOT NULL,
  `started_at` integer,
  `closed_at` integer,
  `work_entry_id` text,
  `evidence_id` text,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`iteration_id`) REFERENCES `iterations`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`work_entry_id`) REFERENCES `work_entries`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`evidence_id`) REFERENCES `evidence`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_agent_runs` (
  `id`, `task_id`, `iteration_id`, `project_id`, `agent_kind`, `provider`, `model`,
  `status`, `system_prompt`, `user_prompt`, `output`, `error_message`,
  `tokens_in`, `tokens_out`, `cost_cents`, `started_at`, `closed_at`,
  `work_entry_id`, `evidence_id`, `created_at`, `updated_at`
)
SELECT
  ar.`id`,
  ar.`task_id`,
  ar.`iteration_id`,
  ph.`project_id`,
  ar.`agent_kind`,
  ar.`provider`,
  ar.`model`,
  ar.`status`,
  ar.`system_prompt`,
  ar.`user_prompt`,
  ar.`output`,
  ar.`error_message`,
  ar.`tokens_in`,
  ar.`tokens_out`,
  ar.`cost_cents`,
  ar.`started_at`,
  ar.`closed_at`,
  ar.`work_entry_id`,
  ar.`evidence_id`,
  ar.`created_at`,
  ar.`updated_at`
FROM `agent_runs` ar
LEFT JOIN `tasks` t ON t.`id` = ar.`task_id`
LEFT JOIN `stories` s ON s.`id` = t.`story_id`
LEFT JOIN `quotes` q ON q.`id` = s.`quote_id`
LEFT JOIN `phases` ph ON ph.`id` = q.`phase_id`;
--> statement-breakpoint
DROP TABLE `agent_runs`;--> statement-breakpoint
ALTER TABLE `__new_agent_runs` RENAME TO `agent_runs`;--> statement-breakpoint
CREATE INDEX `agent_runs_project_idx` ON `agent_runs` (`project_id`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
