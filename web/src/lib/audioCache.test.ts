import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveAudioBlob, resolveAudioUrl } from './audioCache';

class MemoryCache {
  entries = new Map<string, Response>();

  async match(url: string): Promise<Response | undefined> {
    return this.entries.get(url);
  }

  async put(url: string, response: Response): Promise<void> {
    this.entries.set(url, response);
  }

  async keys(): Promise<Request[]> {
    return Array.from(this.entries.keys()).map((url) => new Request(url));
  }

  async delete(request: Request): Promise<boolean> {
    return this.entries.delete(request.url);
  }
}

describe('audioCache', () => {
  let cache: MemoryCache;
  let objectUrlCount: number;

  beforeEach(() => {
    cache = new MemoryCache();
    objectUrlCount = 0;
    vi.stubGlobal('caches', {
      open: vi.fn(() => Promise.resolve(cache)),
    });
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => `blob:audio-${objectUrlCount++}`),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns the cached audio blob without fetching again', async () => {
    const url = 'https://example.com/song.mp3';
    await cache.put(url, new Response('cached-audio'));
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const blob = await resolveAudioBlob(url);

    expect(await blob?.text()).toBe('cached-audio');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('builds the playable object URL from the same cached blob helper', async () => {
    const url = 'https://example.com/song.mp3';
    await cache.put(url, new Response('cached-audio'));

    await expect(resolveAudioUrl(url)).resolves.toBe('blob:audio-0');
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    const arg = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(arg.constructor.name).toBe('Blob');
  });
});
