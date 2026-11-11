import { sql } from 'drizzle-orm';
import { sqliteTable, integer, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

// 审计字段（除 sessions 外每表都有）。created_date 由 DB 默认；
// last_modified_date 由 service 层在更新时写入（默认等于创建时刻）。
const audit = {
  createdDate: integer('created_date', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  lastModifiedDate: integer('last_modified_date', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
};

export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    displayName: text('display_name').notNull(),
    isAdmin: integer('is_admin', { mode: 'boolean' }).notNull().default(false),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    mustChangePassword: integer('must_change_password', { mode: 'boolean' })
      .notNull()
      .default(false),
    ...audit,
  },
  (t) => ({
    emailUq: uniqueIndex('users_email_uq').on(t.email),
  }),
);

export const userPrefs = sqliteTable(
  'user_prefs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').notNull(),
    recentCount: integer('recent_count').notNull().default(8),
    pageSize: integer('page_size').notNull().default(24),
    defaultSort: text('default_sort').notNull().default('created'),
    backgroundImageUrl: text('background_image_url'),
    backgroundType: text('background_type', { enum: ['none', 'bing', 'custom'] })
      .notNull()
      .default('none'),
    backgroundOpacityLight: integer('background_opacity_light').notNull().default(70), // 存储为 0-100 整数
    backgroundOpacityDark: integer('background_opacity_dark').notNull().default(70), // 存储为 0-100 整数
    musicPlaylist: text('music_playlist').notNull().default('[]'),
    slogan: text('slogan'),
    ...audit,
  },
  (t) => ({
    userUq: uniqueIndex('user_prefs_user_uq').on(t.userId),
  }),
);

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(), // 随机 token
    userId: integer('user_id').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    userIdx: index('sessions_user_idx').on(t.userId),
    expiresIdx: index('sessions_expires_idx').on(t.expiresAt),
  }),
);

export const searchEngines = sqliteTable(
  'search_engines',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').notNull(),
    name: text('name').notNull(),
    urlTemplate: text('url_template').notNull(), // 含 {query}
    iconUrl: text('icon_url'),
    sortOrder: integer('sort_order').notNull().default(0),
    isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
    // 搜索建议来源：仅允许 google / baidu；NULL 表示无（业务上按「无」处理，不回填旧数据）。
    suggestSource: text('suggest_source', { enum: ['google', 'baidu'] }),
    ...audit,
  },
  (t) => ({
    userSortIdx: index('engines_user_sort_idx').on(t.userId, t.sortOrder),
  }),
);

export const bookmarks = sqliteTable(
  'bookmarks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').notNull(),
    url: text('url').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    faviconUrl: text('favicon_url'),
    weight: integer('weight').notNull().default(100),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    lastVisitedAt: integer('last_visited_at', { mode: 'timestamp' }),
    visitCount: integer('visit_count').notNull().default(0),
    ...audit,
  },
  (t) => ({
    userUrlUq: uniqueIndex('bookmarks_user_url_uq').on(t.userId, t.url),
    userWeightIdx: index('bookmarks_user_weight_idx').on(t.userId, t.weight),
    userLastVisitIdx: index('bookmarks_user_lastvisit_idx').on(t.userId, t.lastVisitedAt),
    // 首页榜单热路径：按访问次数 / 创建时间排序（listTops、orderFor 的 visits/created 分支）。
    userVisitCountIdx: index('bookmarks_user_visitcount_idx').on(t.userId, t.visitCount),
    userCreatedIdx: index('bookmarks_user_created_idx').on(t.userId, t.createdDate),
  }),
);

export const tags = sqliteTable(
  'tags',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').notNull(),
    name: text('name').notNull(),
    parentId: integer('parent_id'), // 自引用，可空
    path: text('path').notNull(), // 缓存，如 技术/python
    ...audit,
  },
  (t) => ({
    userPathUq: uniqueIndex('tags_user_path_uq').on(t.userId, t.path),
    userParentIdx: index('tags_user_parent_idx').on(t.userId, t.parentId),
  }),
);

export const bookmarkTags = sqliteTable(
  'bookmark_tags',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    bookmarkId: integer('bookmark_id').notNull(),
    tagId: integer('tag_id').notNull(),
    ...audit,
  },
  (t) => ({
    uq: uniqueIndex('bookmark_tags_uq').on(t.bookmarkId, t.tagId),
    tagIdx: index('bookmark_tags_tag_idx').on(t.tagId),
  }),
);

export const schema = {
  users,
  userPrefs,
  sessions,
  searchEngines,
  bookmarks,
  tags,
  bookmarkTags,
};
