-- 数据回填：已设置背景图 URL 但 background_type 仍为 'none' 的用户，补为 'custom'。
-- 该回填原先写在 migrate.ts 的代码里，只在 Node 侧执行、D1 侧静默缺失；
-- 下沉为 SQL 迁移后双栈各执行一次（drizzle 迁移器 / wrangler d1 migrations apply）。
UPDATE `user_prefs`
SET `background_type` = 'custom'
WHERE `background_type` = 'none'
  AND `background_image_url` IS NOT NULL
  AND `background_image_url` != '';
