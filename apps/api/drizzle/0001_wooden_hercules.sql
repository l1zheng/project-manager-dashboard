CREATE TABLE `media_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`mime_type` text NOT NULL,
	`byte_length` integer NOT NULL,
	`sha256` text NOT NULL,
	`original_filename` text,
	`content` blob NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `media_assets_workspace_archive_idx` ON `media_assets` (`workspace_id`,`archived_at`);--> statement-breakpoint
CREATE INDEX `media_assets_workspace_digest_idx` ON `media_assets` (`workspace_id`,`sha256`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_dashboard_blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`dashboard_id` text NOT NULL,
	`kind` text DEFAULT 'table_view' NOT NULL,
	`view_id` text,
	`media_asset_id` text,
	`config_version` integer DEFAULT 1 NOT NULL,
	`config_json` text DEFAULT '{}' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_collapsed` integer DEFAULT false NOT NULL,
	`include_in_export` integer DEFAULT true NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`dashboard_id`) REFERENCES `dashboards`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`view_id`) REFERENCES `views`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`media_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "dashboard_blocks_reference_shape_check" CHECK(("__new_dashboard_blocks"."kind" = 'table_view' AND "__new_dashboard_blocks"."view_id" IS NOT NULL AND "__new_dashboard_blocks"."media_asset_id" IS NULL) OR ("__new_dashboard_blocks"."kind" = 'text' AND "__new_dashboard_blocks"."view_id" IS NULL AND "__new_dashboard_blocks"."media_asset_id" IS NULL) OR ("__new_dashboard_blocks"."kind" = 'image' AND "__new_dashboard_blocks"."view_id" IS NULL))
);
--> statement-breakpoint
INSERT INTO `__new_dashboard_blocks`("id", "dashboard_id", "kind", "view_id", "media_asset_id", "config_version", "config_json", "sort_order", "is_collapsed", "include_in_export", "archived_at", "created_at", "updated_at") SELECT "id", "dashboard_id", 'table_view', "view_id", NULL, 1, json_object('version', 1, 'titleOverride', "title_override", 'description', "description"), "sort_order", "is_collapsed", "include_in_export", NULL, "created_at", "updated_at" FROM `dashboard_blocks`;--> statement-breakpoint
DROP TABLE `dashboard_blocks`;--> statement-breakpoint
ALTER TABLE `__new_dashboard_blocks` RENAME TO `dashboard_blocks`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `dashboard_blocks_dashboard_order_idx` ON `dashboard_blocks` (`dashboard_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `dashboard_blocks_view_idx` ON `dashboard_blocks` (`view_id`);--> statement-breakpoint
CREATE INDEX `dashboard_blocks_media_asset_idx` ON `dashboard_blocks` (`media_asset_id`);
