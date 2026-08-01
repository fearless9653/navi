import { useTagsStore } from './tags';
import { usePrefsStore } from './prefs';
import { useBookmarksStore } from './bookmarks';
import { useEnginesStore } from './engines';
import { useMusicStore } from './music';
import { useAdminUsersStore } from './adminUsers';

/**
 * 账号切换（登录 / 登出 / 换号）时重置所有「账号相关」数据 store。
 * 登录/登出是纯 SPA 跳转、无整页刷新，若不重置，下个用户会看到上个用户的
 * 标签 / 偏好 / 书签缓存 / 歌单（loadAll/prefs 的空值短路会跳过重新拉取），
 * 直接违反账号隔离。auth store 在 login/logout/logoutAll 时调用本函数。
 * 各数据 store 均不 import auth，故无循环依赖。
 */
export function resetDataStores(): void {
  useMusicStore().reset(); // 先释放音频元素与 blob URL
  useBookmarksStore().reset();
  useTagsStore().reset();
  usePrefsStore().reset();
  useEnginesStore().reset();
  useAdminUsersStore().reset();
}
