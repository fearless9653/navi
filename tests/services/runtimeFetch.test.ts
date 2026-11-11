import { afterEach, describe, expect, it } from 'vitest';
import { resolveFetch } from '@/services/runtimeFetch';
import { ILLEGAL_INVOCATION, installStrictGlobalFetch } from '../helpers/strictFetch';

describe('resolveFetch', () => {
  const restores: Array<() => void> = [];
  afterEach(() => {
    while (restores.length) restores.pop()!();
  });

  it('默认与显式注入的 globalThis.fetch 都以 globalThis 为接收者', async () => {
    let calls = 0;
    restores.push(
      installStrictGlobalFetch(async () => {
        calls += 1;
        return new Response('ok');
      }),
    );

    await expect(resolveFetch()('https://example.com')).resolves.toBeInstanceOf(Response);
    await expect(resolveFetch(globalThis.fetch)('https://example.com')).resolves.toBeInstanceOf(
      Response,
    );
    expect(calls).toBe(2);
  });

  it('普通注入函数保持裸调用，不会被 bind 到 globalThis', async () => {
    const seen: unknown[] = [];
    const injected = async function (this: unknown) {
      seen.push(this);
      return new Response('ok');
    };
    const wrapped = resolveFetch(injected as unknown as typeof fetch);
    await wrapped('https://example.com');
    expect(seen).toEqual([undefined]);
  });

  it('严格接收者下，直接拿下的全局 fetch 作为方法调用会失败，resolveFetch 后可通过', async () => {
    restores.push(installStrictGlobalFetch(async () => new Response('ok')));
    const detached = { fetch: globalThis.fetch };
    expect(() => {
      void detached.fetch('https://example.com');
    }).toThrow(ILLEGAL_INVOCATION);
    await expect(resolveFetch(globalThis.fetch)('https://example.com')).resolves.toBeInstanceOf(
      Response,
    );
  });
});
