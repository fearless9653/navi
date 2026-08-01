PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_user_prefs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`recent_count` integer DEFAULT 8 NOT NULL,
	`page_size` integer DEFAULT 24 NOT NULL,
	`default_sort` text DEFAULT 'created' NOT NULL,
	`background_image_url` text,
	`background_type` text DEFAULT 'none' NOT NULL,
	`background_opacity_light` integer DEFAULT 70 NOT NULL,
	`background_opacity_dark` integer DEFAULT 70 NOT NULL,
	`music_playlist` text DEFAULT '[]' NOT NULL,
	`slogan` text,
	`created_date` integer DEFAULT (unixepoch()) NOT NULL,
	`last_modified_date` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_user_prefs`("id", "user_id", "recent_count", "page_size", "default_sort", "background_image_url", "background_type", "background_opacity_light", "background_opacity_dark", "music_playlist", "slogan", "created_date", "last_modified_date") SELECT "id", "user_id", "recent_count", "page_size", "default_sort", "background_image_url", "background_type", "background_opacity_light", "background_opacity_dark", "music_playlist", "slogan", "created_date", "last_modified_date" FROM `user_prefs`;--> statement-breakpoint
DROP TABLE `user_prefs`;--> statement-breakpoint
ALTER TABLE `__new_user_prefs` RENAME TO `user_prefs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `user_prefs_user_uq` ON `user_prefs` (`user_id`);