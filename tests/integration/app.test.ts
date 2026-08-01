import { describe, it, expect } from 'vitest';
import { createApp } from '@/app';
import { createTestDb } from '../helpers/testDb';

describe('app', () => {
  it('GET /api/health 返回 ok', async () => {
    const app = createApp(createTestDb());
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('为 /api/* 响应统一设置禁止缓存响应头', async () => {
    const app = createApp(createTestDb());
    const res = await app.request('/api/health');

    expect(res.headers.get('cache-control')).toBe('no-store, no-cache, must-revalidate, max-age=0');
    expect(res.headers.get('pragma')).toBe('no-cache');
    expect(res.headers.get('expires')).toBe('0');
  });
});
