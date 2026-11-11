import { describe, it, expect, vi } from 'vitest';
import { FETCH_USER_AGENT, fetchMetadata } from '@/services/fetcher';

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

  it('application/xhtml+xml 也按 HTML 解析', async () => {
    const fetchImpl = vi.fn(async () =>
      htmlResponse('<title>XHTML</title>', 'application/xhtml+xml; charset=utf-8'),
    );
    const md = await fetchMetadata('https://example.com', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(md.title).toBe('XHTML');
  });

  it('缺少 Content-Type 但正文是 HTML 时仍解析', async () => {
    const fetchImpl = vi.fn(async () => htmlResponse('<title>Sniffed</title>', ''));
    const md = await fetchMetadata('https://example.com', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(md.title).toBe('Sniffed');
  });

  it('非 2xx HTML 不把错误页标题当成功结果', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('<title>Not Found</title>', {
          status: 404,
          headers: { 'content-type': 'text/html' },
        }),
    );
    const md = await fetchMetadata('https://example.com/missing', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(md.title).toBeNull();
    expect(md.description).toBeNull();
    expect(md.faviconUrl).toBe('https://example.com/favicon.ico');
  });

  it('5xx 后重试成功则返回元数据', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('nope', { status: 503 }))
      .mockResolvedValueOnce(htmlResponse('<title>Recovered</title>'));
    const md = await fetchMetadata('https://example.com', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(md.title).toBe('Recovered');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('请求带上浏览器 UA，并透传 Accept-Language', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const h = new Headers(init?.headers);
      expect(h.get('user-agent')).toBe(FETCH_USER_AGENT);
      expect(h.get('accept-language')).toBe('zh');
      return htmlResponse('<title>Lang</title>');
    });
    await fetchMetadata('https://example.com', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      acceptLanguage: 'zh',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('未传入 Accept-Language 时不附带该头', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const h = new Headers(init?.headers);
      expect(h.has('accept-language')).toBe(false);
      return htmlResponse('<title>NoLang</title>');
    });
    await fetchMetadata('https://example.com', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
  });

  it('同时解析出 IPv6 与 IPv4 时优先钉 IPv4', async () => {
    const makeDispatcher = vi.fn(() => ({ close: vi.fn() }));
    const fetchImpl = vi.fn(async () => htmlResponse('<title>V4</title>'));
    await fetchMetadata('https://example.com', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      lookup: async () => ['2001:db8::1', '93.184.216.34'],
      makeDispatcher,
    });
    expect(makeDispatcher).toHaveBeenCalledTimes(1);
    expect(makeDispatcher).toHaveBeenCalledWith('93.184.216.34');
  });

  it('首选 IP 连接失败时回退到下一个地址', async () => {
    const makeDispatcher = vi.fn((ip: string) => ({ close: vi.fn(), ip }));
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit & { dispatcher?: { ip: string } }) => {
      if (init?.dispatcher?.ip === '93.184.216.34') throw new Error('connect_failed');
      return htmlResponse('<title>Fallback</title>');
    });
    const md = await fetchMetadata('https://example.com', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      lookup: async () => ['2001:db8::1', '93.184.216.34'],
      makeDispatcher,
    });
    expect(md.title).toBe('Fallback');
    expect(makeDispatcher).toHaveBeenNthCalledWith(1, '93.184.216.34');
    expect(makeDispatcher).toHaveBeenNthCalledWith(2, '2001:db8::1');
  });

  it('GBK 响应能解码中文标题', async () => {
    const title = Uint8Array.of(0xc4, 0xe3, 0xba, 0xc3);
    const body = Uint8Array.from([
      ...new TextEncoder().encode('<title>'),
      ...title,
      ...new TextEncoder().encode('</title>'),
    ]);
    const fetchImpl = vi.fn(async () => new Response(body, { headers: { 'content-type': 'text/html; charset=gbk' } }));
    const md = await fetchMetadata('https://example.com', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(md.title).toBe('你好');
  });
});
