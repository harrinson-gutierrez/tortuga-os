PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_design_frames` (
  `id` text PRIMARY KEY NOT NULL,
  `project_id` text NOT NULL,
  `story_id` text,
  `figma_file_key` text NOT NULL,
  `figma_node_id` text NOT NULL,
  `name` text NOT NULL,
  `tokens_json` text DEFAULT '{}' NOT NULL,
  `baseline_screenshot_path` text,
  `status` text DEFAULT 'imported' NOT NULL,
  `fidelity_pct` integer,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `deleted_at` integer,
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_design_frames` (
  `id`, `project_id`, `story_id`, `figma_file_key`, `figma_node_id`, `name`,
  `tokens_json`, `baseline_screenshot_path`, `status`, `fidelity_pct`,
  `created_at`, `updated_at`, `deleted_at`
)
SELECT
  df.`id`,
  ph.`project_id`,
  df.`story_id`,
  df.`figma_file_key`,
  df.`figma_node_id`,
  df.`name`,
  df.`tokens_json`,
  df.`baseline_screenshot_path`,
  df.`status`,
  df.`fidelity_pct`,
  df.`created_at`,
  df.`updated_at`,
  df.`deleted_at`
FROM `design_frames` df
JOIN `stories` s ON s.`id` = df.`story_id`
JOIN `quotes` q ON q.`id` = s.`quote_id`
JOIN `phases` ph ON ph.`id` = q.`phase_id`;
--> statement-breakpoint
DROP TABLE `design_frames`;--> statement-breakpoint
ALTER TABLE `__new_design_frames` RENAME TO `design_frames`;--> statement-breakpoint
CREATE UNIQUE INDEX `design_frames_project_node_uq` ON `design_frames` (`project_id`,`figma_node_id`);--> statement-breakpoint
CREATE INDEX `design_frames_project_idx` ON `design_frames` (`project_id`);--> statement-breakpoint
CREATE INDEX `design_frames_story_idx` ON `design_frames` (`story_id`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
