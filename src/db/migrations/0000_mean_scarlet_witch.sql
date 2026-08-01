CREATE TABLE `bookmark_tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bookmark_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	`created_date` integer DEFAULT (unixepoch()) NOT NULL,
	`last_modified_date` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bookmark_tags_uq` ON `bookmark_tags` (`bookmark_id`,`tag_id`);--> statement-breakpoint
CREATE INDEX `bookmark_tags_tag_idx` ON `bookmark_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `bookmarks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`url` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`favicon_url` text,
	`weight` integer DEFAULT 0 NOT NULL,
	`last_visited_at` integer,
	`visit_count` integer DEFAULT 0 NOT NULL,
	`created_date` integer DEFAULT (unixepoch()) NOT NULL,
	`last_modified_date` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bookmarks_user_url_uq` ON `bookmarks` (`user_id`,`url`);--> statement-breakpoint
CREATE INDEX `bookmarks_user_weight_idx` ON `bookmarks` (`user_id`,`weight`);--> statement-breakpoint
CREATE INDEX `bookmarks_user_lastvisit_idx` ON `bookmarks` (`user_id`,`last_visited_at`);--> statement-breakpoint
CREATE TABLE `search_engines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`url_template` text NOT NULL,
	`icon_url` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_date` integer DEFAULT (unixepoch()) NOT NULL,
	`last_modified_date` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `engines_user_sort_idx` ON `search_engines` (`user_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`parent_id` integer,
	`path` text NOT NULL,
	`created_date` integer DEFAULT (unixepoch()) NOT NULL,
	`last_modified_date` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_user_path_uq` ON `tags` (`user_id`,`path`);--> statement-breakpoint
CREATE INDEX `tags_user_parent_idx` ON `tags` (`user_id`,`parent_id`);--> statement-breakpoint
CREATE TABLE `user_prefs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`recent_count` integer DEFAULT 8 NOT NULL,
	`page_size` integer DEFAULT 24 NOT NULL,
	`default_sort` text DEFAULT 'weight' NOT NULL,
	`created_date` integer DEFAULT (unixepoch()) NOT NULL,
	`last_modified_date` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_prefs_user_uq` ON `user_prefs` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`display_name` text NOT NULL,
	`is_admin` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`must_change_password` integer DEFAULT false NOT NULL,
	`created_date` integer DEFAULT (unixepoch()) NOT NULL,
	`last_modified_date` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_uq` ON `users` (`email`);