CREATE INDEX `bookmarks_user_visitcount_idx` ON `bookmarks` (`user_id`,`visit_count`);--> statement-breakpoint
CREATE INDEX `bookmarks_user_created_idx` ON `bookmarks` (`user_id`,`created_date`);