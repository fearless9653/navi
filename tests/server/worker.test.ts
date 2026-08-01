import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  appFetch: vi.fn(async () => new Response('api')),
  assetsFetch: vi.fn(
    async () => new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } }),
  ),
}));

vi.mock('@/db/client', () => ({
  createD1Db: vi.fn(() => ({})),
}));

vi.mock('@/app', () => ({
  createApp: vi.fn(() => ({ fetch: mocks.appFetch })),
}));

vi.mock('@/services/fetcher', () => ({
  fetchMetadata: vi.fn(),
}));

import worker from '@/server/worker';

describe('worker entry', () => {
  beforeEach(() => {
    mocks.appFetch.mockClear();
    mocks.assetsFetch.mockClear();
  });

  it('routes API requests to the Hono app', async () => {
    const env = { DB: {}, ASSETS: { fetch: mocks.assetsFetch } };
    const res = await worker.fetch(new Request('https://navi.example/api/health'), env as never);

    expect(await res.text()).toBe('api');
    expect(mocks.appFetch).toHaveBeenCalledOnce();
    expect(mocks.assetsFetch).not.toHaveBeenCalled();
  });

  it('serves frontend deep links from the assets binding', async () => {
    const env = { DB: {}, ASSETS: { fetch: mocks.assetsFetch } };
    const res = await worker.fetch(
      new Request('https://navi.example/settings/bookmarks'),
      env as never,
    );

    expect(res.headers.get('content-type')).toContain('text/html');
    expect(mocks.assetsFetch).toHaveBeenCalledOnce();
    expect(mocks.appFetch).not.toHaveBeenCalled();
  });
});
