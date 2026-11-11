// 领域类型（与后端 service 返回结构对应的前端视图）。
export interface PublicUser {
  id: number;
  email: string;
  displayName: string;
  isAdmin: boolean;
  isActive: boolean;
  mustChangePassword: boolean;
  createdDate: string; // ISO 8601 格式
  lastModifiedDate: string;
}

export interface Tag {
  id: number;
  name: string;
  parentId: number | null;
  path: string;
  childrenCount?: number; // 懒加载时使用：子标签数量
  createdDate: string; // ISO 8601 格式
  lastModifiedDate: string;
}

export interface Bookmark {
  id: number;
  url: string;
  name: string;
  description: string | null;
  faviconUrl: string | null;
  weight: number;
  isActive: boolean;
  lastVisitedAt: string | null; // ISO 8601 格式（后端 Date 经 JSON 序列化）
  visitCount: number;
  tags: Tag[];
  createdDate: string; // ISO 8601 格式
  lastModifiedDate: string;
}

/** 最近访问列表的精简字段（默认接口只返回这些）。 */
export type RecentBookmark = Pick<Bookmark, 'id' | 'url' | 'name' | 'faviconUrl'>;

/** 首页三榜单（GET /bookmarks/top）：访问次数 / 自设权重 / 创建时间，均为精简字段。 */
export interface TopLists {
  visits: RecentBookmark[];
  weight: RecentBookmark[];
  created: RecentBookmark[];
}

/**
 * 首页列表精简项：书签标量全字段 + 仅 tagIds（不含标签整行）。
 * 前端用全量标签映射把 tagIds 组装回 tags，得到完整 Bookmark。
 */
export type BookmarkListItem = Omit<Bookmark, 'tags'> & { tagIds: number[] };

export type SuggestSource = 'google' | 'baidu';

export interface Engine {
  id: number;
  name: string;
  urlTemplate: string;
  iconUrl: string | null;
  sortOrder: number;
  isDefault: boolean;
  /** null / 缺省表示无搜索建议。 */
  suggestSource: SuggestSource | null;
}

export interface MusicTrack {
  url: string;
  name: string;
}

export interface Prefs {
  recentCount: number;
  pageSize: number;
  defaultSort: string;
  backgroundType?: 'none' | 'bing' | 'custom';
  backgroundImageUrl?: string | null;
  backgroundOpacityLight?: number;
  backgroundOpacityDark?: number;
  musicPlaylist?: string;
  slogan?: string | null;
}

export type SortKey = 'weight' | 'name' | 'recent' | 'created' | 'updated' | 'visits';
export type SortDir = 'asc' | 'desc';
export type BookmarkStatus = 'active' | 'inactive' | 'all';
