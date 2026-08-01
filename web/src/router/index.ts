import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: () => import('@/views/HomeView.vue') },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { public: true },
  },
  {
    path: '/setup',
    name: 'setup',
    component: () => import('@/views/SetupView.vue'),
    meta: { public: true },
  },
  {
    path: '/change-password',
    name: 'change-password',
    component: () => import('@/views/ChangePasswordView.vue'),
  },
  {
    // 统一设置中心：左侧分组侧边栏 + 嵌套路由分区。
    path: '/settings',
    component: () => import('@/layouts/SettingsLayout.vue'),
    children: [
      { path: '', redirect: { name: 'settings-engines' } },
      {
        path: 'bookmarks',
        name: 'settings-bookmarks',
        component: () => import('@/views/settings/BookmarksSection.vue'),
      },
      {
        path: 'tags',
        name: 'settings-tags',
        component: () => import('@/views/settings/TagsSection.vue'),
      },
      {
        path: 'preferences',
        name: 'settings-preferences',
        component: () => import('@/views/settings/PreferencesSection.vue'),
      },
      {
        path: 'slogan',
        name: 'settings-slogan',
        component: () => import('@/views/settings/SloganSection.vue'),
      },
      {
        path: 'engines',
        name: 'settings-engines',
        component: () => import('@/views/settings/EnginesSection.vue'),
      },
      {
        path: 'background',
        name: 'settings-background',
        component: () => import('@/views/settings/BackgroundSection.vue'),
      },
      {
        path: 'music',
        name: 'settings-music',
        component: () => import('@/views/settings/MusicSection.vue'),
      },
      {
        path: 'transfer',
        name: 'settings-transfer',
        component: () => import('@/views/settings/TransferSection.vue'),
      },
      {
        path: 'account',
        name: 'settings-account',
        component: () => import('@/views/settings/AccountSection.vue'),
      },
      {
        path: 'admin',
        name: 'settings-admin',
        component: () => import('@/views/settings/UsersSection.vue'),
        meta: { admin: true },
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
    meta: { public: true },
  },
];

export const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach((to) => {
  const auth = useAuthStore();
  // 未初始化系统：强制进首启向导。
  if (auth.needsSetup && to.name !== 'setup') return { name: 'setup' };
  if (!auth.needsSetup && to.name === 'setup') return { name: 'home' };
  // 必须改密：拦到改密页。
  if (auth.user?.mustChangePassword && to.name !== 'change-password') {
    return { name: 'change-password' };
  }
  // 首页对游客开放（裸搜索）；其余非 public 页需登录。
  if (!to.meta.public && to.name !== 'home' && !auth.isAuthed) return { name: 'login' };
  // 仅管理员分区。
  if (to.meta.admin && !auth.isAdmin) return { name: 'home' };
  return true;
});
