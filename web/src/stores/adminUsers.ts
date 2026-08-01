import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/api/client';
import type { PublicUser } from '@/api/types';

export const useAdminUsersStore = defineStore('adminUsers', () => {
  const users = ref<PublicUser[]>([]);

  async function load(): Promise<void> {
    users.value = (await api.get<{ users: PublicUser[] }>('/admin/users')).users;
  }
  async function create(input: {
    email: string;
    password: string;
    displayName: string;
    isAdmin?: boolean;
  }): Promise<void> {
    await api.post('/admin/users', input);
    await load();
  }
  async function update(id: number, patch: Record<string, unknown>): Promise<void> {
    await api.patch(`/admin/users/${id}`, patch);
    await load();
  }
  async function remove(id: number): Promise<void> {
    await api.del(`/admin/users/${id}`);
    await load();
  }

  /** 账号切换时清空管理员用户列表。 */
  function reset(): void {
    users.value = [];
  }

  return { users, load, create, update, remove, reset };
});
