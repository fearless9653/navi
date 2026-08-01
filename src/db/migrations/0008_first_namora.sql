PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_bookmarks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`url` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`favicon_url` text,
	`weight` integer DEFAULT 100 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`last_visited_at` integer,
	`visit_count` integer DEFAULT 0 NOT NULL,
	`created_date` integer DEFAULT (unixepoch()) NOT NULL,
	`last_modified_date` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_bookmarks`("id", "user_id", "url", "name", "description", "favicon_url", "weight", "is_active", "last_visited_at", "visit_count", "created_date", "last_modified_date") SELECT "id", "user_id", "url", "name", "description", "favicon_url", "weight", "is_active", "last_visited_at", "visit_count", "created_date", "last_modified_date" FROM `bookmarks`;--> statement-breakpoint
DROP TABLE `bookmarks`;--> statement-breakpoint
ALTER TABLE `__new_bookmarks` RENAME TO `bookmarks`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `bookmarks_user_url_uq` ON `bookmarks` (`user_id`,`url`);--> statement-breakpoint
CREATE INDEX `bookmarks_user_weight_idx` ON `bookmarks` (`user_id`,`weight`);--> statement-breakpoint
CREATE INDEX `bookmarks_user_lastvisit_idx` ON `bookmarks` (`user_id`,`last_visited_at`);