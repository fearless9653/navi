import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { usePrefsStore } from './prefs';
import {
  resolveAudioBlob,
  resolveAudioUrl,
  pruneAudioCache,
  prefetchAudio,
} from '@/lib/audioCache';
import type { MusicTrack } from '@/api/types';

export type LoopMode = 'none' | 'all' | 'single';

export const useMusicStore = defineStore('music', () => {
  const prefs = usePrefsStore();

  const playlist = ref<MusicTrack[]>([]);
  const currentIndex = ref(0);
  const isPlaying = ref(false);
  const currentTime = ref(0);
  const duration = ref(0);
  const volume = ref(parseFloat(localStorage.getItem('music-volume') ?? '0.5'));
  const loopMode = ref<LoopMode>((localStorage.getItem('music-loop-mode') as LoopMode) || 'all');
  const coverUrl = ref<string | null>(null);

  let audio: HTMLAudioElement | null = null;
  let coverCache = new Map<string, string | null>();
  // 当前音频的 blob URL（来自缓存）；为 null 表示用的是原始直链，无需 revoke。
  let currentObjectUrl: string | null = null;
  // 加载令牌：快速切歌时只让最后一次加载生效，丢弃过期结果。
  let loadToken = 0;
  let coverLoadToken = 0;
  let progressTimer: number | null = null;
  // 已发起后台预取的歌单标识（url 拼接）；同一歌单只预取一次。
  let prefetchedKey = '';

  const currentTrack = computed(() => playlist.value[currentIndex.value] ?? null);
  const hasPlaylist = computed(() => playlist.value.length > 0);

  function loadPlaylist(): void {
    const raw = prefs.prefs?.musicPlaylist;
    if (!raw) {
      playlist.value = [];
      return;
    }
    try {
      playlist.value = JSON.parse(raw) as MusicTrack[];
    } catch {
      playlist.value = [];
    }
    if (currentIndex.value >= playlist.value.length) {
      currentIndex.value = 0;
    }
    // 清理已从歌单移除的缓存条目，避免占用无限增长。
    void pruneAudioCache(playlist.value.map((t) => t.url));
  }

  function ensureAudio(): HTMLAudioElement {
    if (!audio) {
      audio = new Audio();
      audio.volume = volume.value;
      audio.addEventListener('timeupdate', syncAudioState);
      audio.addEventListener('durationchange', syncAudioState);
      audio.addEventListener('loadedmetadata', syncAudioState);
      audio.addEventListener('ended', onEnded);
      audio.addEventListener('pause', () => {
        stopProgressTimer();
        syncAudioState();
        isPlaying.value = false;
      });
      audio.addEventListener('play', () => {
        startProgressTimer();
        syncAudioState();
        isPlaying.value = true;
      });
    }
    return audio;
  }

  function syncAudioState(): void {
    if (!audio) return;
    currentTime.value = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    duration.value = Number.isFinite(audio.duration) ? audio.duration : 0;
  }

  function startProgressTimer(): void {
    if (progressTimer !== null) return;
    progressTimer = window.setInterval(() => {
      syncAudioState();
    }, 250);
  }

  function stopProgressTimer(): void {
    if (progressTimer === null) return;
    window.clearInterval(progressTimer);
    progressTimer = null;
  }

  function onEnded(): void {
    if (loopMode.value === 'single') {
      audio!.currentTime = 0;
      void audio!.play();
    } else if (loopMode.value === 'all') {
      next();
    } else {
      if (currentIndex.value < playlist.value.length - 1) {
        next();
      } else {
        isPlaying.value = false;
      }
    }
  }

  async function loadTrack(index: number, autoplay = false): Promise<void> {
    if (index < 0 || index >= playlist.value.length) return;
    currentIndex.value = index;
    const track = playlist.value[index]!;
    const a = ensureAudio();
    currentTime.value = 0;
    duration.value = 0;
    coverUrl.value = null;
    void extractCover(track.url, ++coverLoadToken);
    startPrefetch();

    const token = ++loadToken;
    const resolved = await resolveAudioUrl(track.url);
    // 加载期间已被新的切歌取代：丢弃本次结果并释放可能产生的 blob。
    if (token !== loadToken) {
      if (resolved !== track.url) URL.revokeObjectURL(resolved);
      return;
    }
    // 释放上一首的 blob URL。
    if (currentObjectUrl && currentObjectUrl !== resolved) {
      URL.revokeObjectURL(currentObjectUrl);
    }
    currentObjectUrl = resolved === track.url ? null : resolved;
    a.src = resolved;
    a.load();
    syncAudioState();
    if (autoplay) void a.play();
  }

  // 用户首次加载某首歌后，后台预取整张歌单，让之后切歌秒开。
  // 从"下一首"开始环形排序：下一首最先就绪；当前曲目排在最后（届时按需路径已缓存，跳过）。
  function startPrefetch(): void {
    const urls = playlist.value.map((t) => t.url);
    if (urls.length <= 1) return;
    const key = urls.join('|');
    if (key === prefetchedKey) return;
    prefetchedKey = key;
    const start = currentIndex.value + 1;
    const ordered = [...urls.slice(start), ...urls.slice(0, start)];
    void prefetchAudio(ordered);
  }

  function play(): void {
    if (!hasPlaylist.value) return;
    const a = ensureAudio();
    if (!a.src || a.src === location.href) {
      void loadTrack(currentIndex.value, true);
    } else {
      void a.play();
    }
  }

  function pause(): void {
    audio?.pause();
  }

  function toggle(): void {
    if (isPlaying.value) pause();
    else play();
  }

  function next(): void {
    if (!hasPlaylist.value) return;
    const nextIdx = (currentIndex.value + 1) % playlist.value.length;
    void loadTrack(nextIdx, true);
  }

  function prev(): void {
    if (!hasPlaylist.value) return;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    const prevIdx = (currentIndex.value - 1 + playlist.value.length) % playlist.value.length;
    void loadTrack(prevIdx, true);
  }

  function seek(time: number): void {
    const a = ensureAudio();
    if (a.duration) {
      a.currentTime = Math.min(time, a.duration);
      syncAudioState();
    }
  }

  function setVolume(v: number): void {
    volume.value = Math.max(0, Math.min(1, v));
    if (audio) audio.volume = volume.value;
    localStorage.setItem('music-volume', String(volume.value));
  }

  function cycleLoopMode(): void {
    const modes: LoopMode[] = ['none', 'all', 'single'];
    const idx = modes.indexOf(loopMode.value);
    loopMode.value = modes[(idx + 1) % modes.length]!;
    localStorage.setItem('music-loop-mode', loopMode.value);
    if (audio) {
      audio.loop = loopMode.value === 'single';
    }
  }

  async function extractCover(url: string, token: number): Promise<void> {
    if (coverCache.has(url)) {
      if (token !== coverLoadToken) return;
      coverUrl.value = coverCache.get(url) ?? null;
      return;
    }
    try {
      const audioBlob = await resolveAudioBlob(url);
      if (!audioBlob) {
        coverCache.set(url, null);
        if (token !== coverLoadToken) return;
        coverUrl.value = null;
        return;
      }
      const { parseBlob, selectCover } = await import('music-metadata');
      const metadata = await parseBlob(audioBlob);
      const picture = selectCover(metadata.common.picture);
      if (picture) {
        const { data, format } = picture;
        const imageBytes = new Uint8Array(data.length);
        imageBytes.set(data);
        const blob = new Blob([imageBytes], { type: format });
        const objectUrl = URL.createObjectURL(blob);
        coverCache.set(url, objectUrl);
        if (token !== coverLoadToken) return;
        coverUrl.value = objectUrl;
      } else {
        coverCache.set(url, null);
        if (token !== coverLoadToken) return;
        coverUrl.value = null;
      }
    } catch {
      coverCache.set(url, null);
      if (token !== coverLoadToken) return;
      coverUrl.value = null;
    }
  }

  function dispose(): void {
    stopProgressTimer();
    if (audio) {
      audio.pause();
      audio.src = '';
      audio.removeEventListener('ended', onEnded);
      audio = null;
    }
    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = null;
    }
    coverCache.forEach((url) => {
      if (url) URL.revokeObjectURL(url);
    });
    coverCache = new Map();
  }

  /** 账号切换时清空：释放音频/blob 并归位播放态（保留 volume/loopMode 等设备级偏好）。 */
  function reset(): void {
    dispose();
    playlist.value = [];
    currentIndex.value = 0;
    isPlaying.value = false;
    currentTime.value = 0;
    duration.value = 0;
    coverUrl.value = null;
    prefetchedKey = '';
    // 作废任何在途加载/封面提取结果，避免它们回填到已重置的状态。
    loadToken++;
    coverLoadToken++;
  }

  watch(volume, (v) => {
    if (audio) audio.volume = v;
  });

  return {
    playlist,
    currentIndex,
    isPlaying,
    currentTime,
    duration,
    volume,
    loopMode,
    coverUrl,
    currentTrack,
    hasPlaylist,
    loadPlaylist,
    loadTrack,
    play,
    pause,
    toggle,
    next,
    prev,
    seek,
    setVolume,
    cycleLoopMode,
    dispose,
    reset,
  };
});
