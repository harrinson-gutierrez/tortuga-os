CREATE TABLE `step_acks` (
  `id` text PRIMARY KEY NOT NULL,
  `task_id` text NOT NULL,
  `iteration_n` integer NOT NULL,
  `step_id` text NOT NULL,
  `ack` text NOT NULL,
  `acked_by_role` text NOT NULL,
  `notes` text,
  `acked_at` integer NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `step_acks_task_iter_step_uq` ON `step_acks` (`task_id`,`iteration_n`,`step_id`);
--> statement-breakpoint
CREATE INDEX `step_acks_task_iter_idx` ON `step_acks` (`task_id`,`iteration_n`);
