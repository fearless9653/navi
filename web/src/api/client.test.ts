import { describe, it, expect, vi, afterEach } from 'vitest';
import { api } from './client';

describe('api client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('GET 走 /api 前缀、带 credentials、解析 JSON', async () => {
    const f = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: 1 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', f);
    expect(await api.get('/x')).toEqual({ ok: 1 });
    expect(f).toHaveBeenCalledWith(
      '/api/x',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
  });

  it('非 2xx 抛 ApiException（带 status + body）', async () => {
    vi.stubGlobal(
      'fetch',
      async () => new Response(JSON.stringify({ error: 'nope' }), { status: 403 }),
    );
    await expect(api.get('/x')).rejects.toMatchObject({ status: 403, body: { error: 'nope' } });
  });
});
