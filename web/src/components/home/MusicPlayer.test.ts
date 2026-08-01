import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import MusicPlayer from './MusicPlayer.vue';
import { useMusicStore } from '@/stores/music';
import { usePrefsStore } from '@/stores/prefs';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('@/lib/audioCache', () => ({
  resolveAudioUrl: (url: string) => Promise.resolve(url),
  resolveAudioBlob: (url: string) =>
    Promise.resolve(new Blob([`audio:${url}`], { type: 'audio/mpeg' })),
  pruneAudioCache: () => Promise.resolve(),
  prefetchAudio: () => Promise.resolve(),
}));

const metadataMock = vi.hoisted(() => ({
  reads: [] as Array<() => void>,
}));

vi.mock('music-metadata', () => ({
  parseBlob: (blob: Blob) =>
    new Promise((resolve) => {
      metadataMock.reads.push(() => {
        expect(blob.type).toBe('audio/mpeg');
        resolve({
          common: { picture: [{ data: new Uint8Array([1, 2, 3]), format: 'image/png' }] },
        });
      });
    }),
  selectCover: (pictures: unknown[]) => pictures[0],
}));

class MockAudio extends EventTarget {
  src = '';
  volume = 0;
  loop = false;
  currentTime = 0;
  duration = 120;

  load() {}

  play() {
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  }

  pause() {
    this.dispatchEvent(new Event('pause'));
  }
}

async function flushMusicImports(): Promise<void> {
  await vi.dynamicImportSettled();
  await Promise.resolve();
}

describe('MusicPlayer', () => {
  let audio: MockAudio | null;
  let objectUrlCount: number;

  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    metadataMock.reads = [];
    audio = null;
    objectUrlCount = 0;
    vi.stubGlobal(
      'Audio',
      vi.fn(function () {
        audio = new MockAudio();
        return audio;
      }),
    );
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => `blob:cover-${objectUrlCount++}`),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps the audio engine alive when the player UI unmounts during navigation', async () => {
    const prefs = usePrefsStore();
    prefs.prefs = {
      defaultSort: 'weight',
      recentCount: 10,
      pageSize: 24,
      backgroundType: 'none',
      musicPlaylist: JSON.stringify([{ name: 'Theme', url: 'https://example.com/theme.mp3' }]),
    };

    const music = useMusicStore();
    const dispose = vi.spyOn(music, 'dispose');

    const wrapper = mount(MusicPlayer);
    await wrapper.vm.$nextTick();

    wrapper.unmount();

    expect(dispose).not.toHaveBeenCalled();
  });

  it('keeps the current cover when an older cover read finishes late', async () => {
    const music = useMusicStore();
    music.playlist = [
      { name: 'First', url: 'https://example.com/first.mp3' },
      { name: 'Second', url: 'https://example.com/second.mp3' },
    ];

    await music.loadTrack(0);
    await flushMusicImports();
    await music.loadTrack(1);
    await flushMusicImports();
    await vi.waitFor(() => expect(metadataMock.reads).toHaveLength(2));

    metadataMock.reads[1]!();
    await Promise.resolve();
    expect(music.coverUrl).toBe('blob:cover-0');

    metadataMock.reads[0]!();
    await Promise.resolve();

    expect(music.coverUrl).toBe('blob:cover-0');
  });

  it('polls the audio clock while playing so progress does not rely only on timeupdate', async () => {
    const music = useMusicStore();
    music.playlist = [{ name: 'Theme', url: 'https://example.com/theme.mp3' }];

    await music.loadTrack(0, true);
    audio!.currentTime = 17;
    vi.advanceTimersByTime(500);

    expect(music.currentTime).toBe(17);
  });

  it('positions the compact player with the shared mobile-safe floating offset', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'web/src/components/home/MusicPlayer.vue'),
      'utf8',
    );

    expect(source).toContain('music-player');
    expect(source).toContain('bottom: var(--home-floating-control-bottom);');
    expect(source).not.toContain('fixed bottom-6 left-6');
  });
});
