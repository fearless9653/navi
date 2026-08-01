import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/api/client';
import type { Prefs } from '@/api/types';

export const usePrefsStore = defineStore('prefs', () => {
  const prefs = ref<Prefs | null>(null);

  // in-flight 去重：AppLayout 与 HomeView 挂载时会并发各调一次 load()，
  // 无去重则发两次 GET /prefs。并发调用共享同一请求，完成后复位以便后续可重新拉取。
  let inFlight: Promise<void> | null = null;
  // 写序号：每次 update 成功自增。load 只在「发起后未发生过 update」时才应用其结果，
  // 否则丢弃这次（可能更旧的）GET，避免慢速在途 load 覆盖刚落地的 PATCH。
  let mutationSeq = 0;

  async function load(): Promise<void> {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      const seqAtStart = mutationSeq;
      try {
        const loaded = (await api.get<{ prefs: Prefs }>('/prefs')).prefs;
        if (seqAtStart === mutationSeq) prefs.value = loaded;
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  }

  async function update(patch: Partial<Prefs>): Promise<void> {
    const updated = (await api.patch<{ prefs: Prefs }>('/prefs', patch)).prefs;
    mutationSeq++;
    prefs.value = updated;
  }

  /** 账号切换时清空，避免下个用户看到上个用户的 slogan/背景/歌单等偏好。 */
  function reset(): void {
    prefs.value = null;
    inFlight = null;
  }

  return { prefs, load, update, reset };
});
