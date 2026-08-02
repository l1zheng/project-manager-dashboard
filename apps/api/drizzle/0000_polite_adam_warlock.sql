CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`config_version` integer DEFAULT 1 NOT NULL,
	`value_json` text DEFAULT '{}' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `dashboard_blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`dashboard_id` text NOT NULL,
	`view_id` text NOT NULL,
	`title_override` text,
	`description` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_collapsed` integer DEFAULT false NOT NULL,
	`include_in_export` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`dashboard_id`) REFERENCES `dashboards`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`view_id`) REFERENCES `views`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `dashboard_blocks_dashboard_order_idx` ON `dashboard_blocks` (`dashboard_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `dashboard_blocks_view_idx` ON `dashboard_blocks` (`view_id`);--> statement-breakpoint
CREATE TABLE `dashboards` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `dashboards_workspace_archive_order_idx` ON `dashboards` (`workspace_id`,`archived_at`,`sort_order`);--> statement-breakpoint
CREATE TABLE `databases` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`color` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`next_sequence` integer DEFAULT 1 NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `databases_workspace_order_idx` ON `databases` (`workspace_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `fields` (
	`id` text PRIMARY KEY NOT NULL,
	`database_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`description` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`config_version` integer DEFAULT 1 NOT NULL,
	`config_json` text DEFAULT '{}' NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`database_id`) REFERENCES `databases`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `fields_database_archive_order_idx` ON `fields` (`database_id`,`archived_at`,`sort_order`);--> statement-breakpoint
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`database_id` text NOT NULL,
	`sequence_number` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`values_version` integer DEFAULT 1 NOT NULL,
	`values_json` text DEFAULT '{}' NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`database_id`) REFERENCES `databases`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `records_database_sequence_unique` ON `records` (`database_id`,`sequence_number`);--> statement-breakpoint
CREATE INDEX `records_database_archive_order_idx` ON `records` (`database_id`,`archived_at`,`sort_order`);--> statement-breakpoint
CREATE TABLE `report_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`config_version` integer DEFAULT 1 NOT NULL,
	`options_json` text DEFAULT '{}' NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `report_templates_workspace_archive_idx` ON `report_templates` (`workspace_id`,`archived_at`);--> statement-breakpoint
CREATE TABLE `views` (
	`id` text PRIMARY KEY NOT NULL,
	`database_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'table' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`config_version` integer DEFAULT 1 NOT NULL,
	`config_json` text DEFAULT '{}' NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`database_id`) REFERENCES `databases`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `views_database_archive_order_idx` ON `views` (`database_id`,`archived_at`,`sort_order`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
