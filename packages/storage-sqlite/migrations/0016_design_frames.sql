CREATE TABLE `design_frames` (
  `id` text PRIMARY KEY NOT NULL,
  `story_id` text NOT NULL,
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
  FOREIGN KEY (`story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `design_frames_story_node_uq` ON `design_frames` (`story_id`,`figma_node_id`);
--> statement-breakpoint
CREATE INDEX `design_frames_story_idx` ON `design_frames` (`story_id`);
