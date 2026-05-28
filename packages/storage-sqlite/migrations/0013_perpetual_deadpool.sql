CREATE TABLE `troubleshoot_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`parent_report_id` text,
	`status` text DEFAULT 'open' NOT NULL,
	`error_text` text NOT NULL,
	`context_note` text,
	`before_screenshot_path` text,
	`after_screenshot_path` text,
	`last_diagnosis_run_id` text,
	`diagnosis_json` text,
	`required_actions_json` text DEFAULT '[]' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`last_test_output` text,
	`resolved_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`last_diagnosis_run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `troubleshoot_reports_task_idx` ON `troubleshoot_reports` (`task_id`);--> statement-breakpoint
CREATE INDEX `troubleshoot_reports_status_idx` ON `troubleshoot_reports` (`status`);