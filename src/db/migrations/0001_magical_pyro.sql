ALTER TABLE `user_prefs` ADD `background_image_url` text;--> statement-breakpoint
ALTER TABLE `user_prefs` ADD `background_opacity_light` integer DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE `user_prefs` ADD `background_opacity_dark` integer DEFAULT 85 NOT NULL;