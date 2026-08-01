import { describe, it, expect, vi } from 'vitest';
import { fetchMetadata } from '@/services/fetcher';

function htmlResponse(html: string, contentType = 'text/html; charset=utf-8'): Response {
  return new Response(html, { status: 200, headers: { 'content-type': contentType } });
}
function redirectResponse(location: string): Response {
  return new Response(null, { status: 302, headers: { location } });
}

describe('fetchMetadata', () => {
  it('正常 200 text/html 抽取元数据', async () => {
    const fetchImpl = vi.fn(async () =>
      htmlResponse(
        '<title>Site</title><meta name="description" content="d"><link rel="icon" href="/f.png">',
      ),
    );
    const md = await fetchMetadata('https://example.com', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(md.title).toBe('Site');
    expect(md.description).toBe('d');
    expect(md.faviconUrl).toBe('https://example.com/f.png');
  });

  it('SSRF：直接拒绝且不调用 fetch', async () => {
    const fetchImpl = vi.fn(async () => htmlResponse('x'));
    await expect(
      fetchMetadata('http://169.254.169.254/', { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('DNS 解析到私网被拒，且不调用 fetch', async () => {
    const fetchImpl = vi.fn(async () => htmlResponse('x'));
    await expect(
      fetchMetadata('https://evil.example', {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        lookup: async () => ['10.0.0.5'],
      }),
    ).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('重定向到私网被拒', async () => {
    const fetchImpl = vi.fn(async () => redirectResponse('http://127.0.0.1/'));
    await expect(
      fetchMetadata('https://example.com', { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('正常重定向到公网后抽取', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(redirectResponse('https://example.org/final'))
      .mockResolvedValueOnce(htmlResponse('<title>Final</title>'));
    const md = await fetchMetadata('https://example.com', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      lookup: async () => ['1.1.1.1'],
    });
    expect(md.title).toBe('Final');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('超长响应被截断（超出上限的内容不参与解析）', async () => {
    const html =
      '<title>Hi</title>' + 'x'.repeat(5000) + '<meta name="description" content="late">';
    const fetchImpl = vi.fn(async () => htmlResponse(html));
    const md = await fetchMetadata('https://example.com', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxBytes: 100,
    });
    expect(md.title).toBe('Hi');
    expect(md.description).toBeNull(); // 描述在上限之外
  });

  it('非 HTML 返回空标题/描述但有 favicon 回退', async () => {
    const fetchImpl = vi.fn(async () => htmlResponse('%PDF-1.7', 'application/pdf'));
    const md = await fetchMetadata('https://example.com/doc.pdf', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(md.title).toBeNull();
    expect(md.description).toBeNull();
    expect(md.faviconUrl).toBe('https://example.com/favicon.ico');
  });

  it('重定向次数超限抛错', async () => {
    const fetchImpl = vi.fn(async () => redirectResponse('https://example.org/'));
    await expect(
      fetchMetadata('https://example.com', {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        lookup: async () => ['1.1.1.1'],
        maxRedirects: 1,
      }),
    ).rejects.toThrow('too_many_redirects');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('把连接钉在已校验 IP：makeDispatcher 收到解析 IP、dispatcher 传入 fetch 并在结束时关闭', async () => {
    const close = vi.fn();
    const dispatcher = { close };
    const makeDispatcher = vi.fn(() => dispatcher);
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit & { dispatcher?: unknown }) => {
      // 校验解析出的 IP 对应的 dispatcher 确实被传入连接，防 rebinding 二次解析。
      expect(init?.dispatcher).toBe(dispatcher);
      return htmlResponse('<title>Pinned</title>');
    });
    const md = await fetchMetadata('https://example.com', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      lookup: async () => ['93.184.216.34'],
      makeDispatcher,
    });
    expect(md.title).toBe('Pinned');
    expect(makeDispatcher).toHaveBeenCalledWith('93.184.216.34');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('重定向每跳分别固定到各自解析出的 IP', async () => {
    const ipByHost: Record<string, string> = {
      'example.com': '1.1.1.1',
      'example.org': '2.2.2.2',
    };
    const makeDispatcher = vi.fn(() => ({ close: vi.fn() }));
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(redirectResponse('https://example.org/final'))
      .mockResolvedValueOnce(htmlResponse('<title>Final</title>'));
    await fetchMetadata('https://example.com', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      lookup: async (h: string) => [ipByHost[h]!],
      makeDispatcher,
    });
    expect(makeDispatcher).toHaveBeenNthCalledWith(1, '1.1.1.1');
    expect(makeDispatcher).toHaveBeenNthCalledWith(2, '2.2.2.2');
  });
});
