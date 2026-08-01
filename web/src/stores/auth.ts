import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '@/api/client';
import type { PublicUser } from '@/api/types';
import { resetDataStores } from './resetData';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<PublicUser | null>(null);
  const needsSetup = ref(false);
  const ready = ref(false);

  const isAuthed = computed(() => user.value !== null);
  const isAdmin = computed(() => user.value?.isAdmin === true);

  /** 启动引导：探测是否需首启，并尝试恢复会话。 */
  async function bootstrap(): Promise<void> {
    try {
      const s = await api.get<{ needsSetup: boolean }>('/setup/status');
      needsSetup.value = s.needsSetup;
    } catch {
      needsSetup.value = false;
    }
    try {
      const me = await api.get<{ user: PublicUser }>('/auth/me');
      user.value = me.user;
    } catch {
      user.value = null;
    }
    ready.value = true;
  }

  async function login(email: string, password: string): Promise<void> {
    const r = await api.post<{ user: PublicUser }>('/auth/login', { email, password });
    resetDataStores(); // 清掉可能残留的上个会话数据，再置新用户
    user.value = r.user;
  }

  async function setupAdmin(email: string, password: string, displayName: string): Promise<void> {
    const r = await api.post<{ user: PublicUser }>('/setup', { email, password, displayName });
    user.value = r.user;
    needsSetup.value = false;
  }

  async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await api.post('/auth/change-password', { currentPassword, newPassword });
    if (user.value) user.value = { ...user.value, mustChangePassword: false };
  }

  async function logout(): Promise<void> {
    // 客户端登出不依赖服务端调用成功：请求失败也照常清本地态与数据 store，保证后续跳转执行。
    try {
      await api.post('/auth/logout');
    } catch {
      /* 忽略：服务端登出失败无碍客户端登出 */
    }
    resetDataStores();
    user.value = null;
  }

  async function logoutAll(): Promise<void> {
    try {
      await api.post('/auth/logout-all');
    } catch {
      /* 忽略：服务端登出失败无碍客户端登出 */
    }
    resetDataStores();
    user.value = null;
  }

  return {
    user,
    needsSetup,
    ready,
    isAuthed,
    isAdmin,
    bootstrap,
    login,
    setupAdmin,
    changePassword,
    logout,
    logoutAll,
  };
});
