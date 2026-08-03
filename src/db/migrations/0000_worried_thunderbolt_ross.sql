CREATE TABLE `comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`issue_id` integer NOT NULL,
	`body` text NOT NULL,
	`author_type` text NOT NULL,
	`author_token_id` integer,
	`author_name` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`issue_id`) REFERENCES `issues`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "comments_author_type" CHECK("comments"."author_type" IN ('agent','human'))
);
--> statement-breakpoint
CREATE INDEX `comments_issue` ON `comments` (`issue_id`);--> statement-breakpoint
CREATE TABLE `issue_labels` (
	`issue_id` integer NOT NULL,
	`label_id` integer NOT NULL,
	PRIMARY KEY(`issue_id`, `label_id`),
	FOREIGN KEY (`issue_id`) REFERENCES `issues`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`label_id`) REFERENCES `labels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `issue_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_id` integer NOT NULL,
	`target_id` integer NOT NULL,
	`type` text NOT NULL,
	`created_by_token_id` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `issues`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_id`) REFERENCES `issues`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "issue_links_type" CHECK("issue_links"."type" IN ('blocks','depends_on','relates_to','duplicates'))
);
--> statement-breakpoint
CREATE INDEX `issue_links_source` ON `issue_links` (`source_id`);--> statement-breakpoint
CREATE INDEX `issue_links_target` ON `issue_links` (`target_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `issue_links_unique` ON `issue_links` (`source_id`,`target_id`,`type`);--> statement-breakpoint
CREATE TABLE `issues` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`number` integer NOT NULL,
	`key` text NOT NULL,
	`kind` text DEFAULT 'issue' NOT NULL,
	`epic_id` integer,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'open' NOT NULL,
	`priority` integer DEFAULT 2 NOT NULL,
	`assignee_type` text,
	`assignee` text,
	`created_by_token_id` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`closed_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "issues_kind" CHECK("issues"."kind" IN ('epic','issue')),
	CONSTRAINT "issues_priority" CHECK("issues"."priority" BETWEEN 0 AND 4),
	CONSTRAINT "issues_assignee_type" CHECK("issues"."assignee_type" IS NULL OR "issues"."assignee_type" IN ('agent','human'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `issues_key_unique` ON `issues` (`key`);--> statement-breakpoint
CREATE INDEX `issues_project_status` ON `issues` (`project_id`,`status`);--> statement-breakpoint
CREATE INDEX `issues_epic` ON `issues` (`epic_id`);--> statement-breakpoint
CREATE INDEX `issues_status` ON `issues` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `issues_project_number` ON `issues` (`project_id`,`number`);--> statement-breakpoint
CREATE TABLE `labels` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`name` text NOT NULL,
	`color` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `labels_project_name` ON `labels` (`project_id`,`name`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`next_issue_number` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_key_unique` ON `projects` (`key`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `statuses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "statuses_category" CHECK("statuses"."category" IN ('todo','active','done'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `statuses_project_name` ON `statuses` (`project_id`,`name`);--> statement-breakpoint
CREATE TABLE `tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tokens_name_unique` ON `tokens` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `tokens_token_hash_unique` ON `tokens` (`token_hash`);