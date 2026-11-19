import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ENGINE_ICON_PATHS,
  engineIconFieldValue,
  isConfiguredEngineIcon,
  resolveEngineIconUrl,
} from './engineIcons';

const GOOGLE = 'https://www.google.com/search?q={query}';
const BING = 'https://www.bing.com/search?q={query}';
const DDG = 'https://duckduckgo.com/?q={query}';
const DDG_WWW = 'https://www.duckduckgo.com/?q={query}';
const CUSTOM = 'https://example.com/search?q={query}';

describe('resolveEngineIconUrl', () => {
  it('预置引擎在未配置或已是本地默认路径时使用站点图标', () => {
    expect(resolveEngineIconUrl(GOOGLE, null)).toBe(DEFAULT_ENGINE_ICON_PATHS.google);
    expect(resolveEngineIconUrl(GOOGLE, '')).toBe(DEFAULT_ENGINE_ICON_PATHS.google);
    expect(resolveEngineIconUrl(GOOGLE, '  ')).toBe(DEFAULT_ENGINE_ICON_PATHS.google);
    expect(resolveEngineIconUrl(GOOGLE, DEFAULT_ENGINE_ICON_PATHS.google)).toBe(
      DEFAULT_ENGINE_ICON_PATHS.google,
    );
    expect(resolveEngineIconUrl(BING, null)).toBe(DEFAULT_ENGINE_ICON_PATHS.bing);
    expect(resolveEngineIconUrl(DDG, null)).toBe(DEFAULT_ENGINE_ICON_PATHS.duckduckgo);
  });

  it('按注册域匹配，忽略协议、大小写和 www，并兼容子域与更深路径', () => {
    expect(resolveEngineIconUrl(DDG_WWW, null)).toBe(DEFAULT_ENGINE_ICON_PATHS.duckduckgo);
    expect(resolveEngineIconUrl('https://WWW.DuckDuckGo.com/?q={query}', null)).toBe(
      DEFAULT_ENGINE_ICON_PATHS.duckduckgo,
    );
    expect(resolveEngineIconUrl('http://google.com/search?q={query}', null)).toBe(
      DEFAULT_ENGINE_ICON_PATHS.google,
    );
    expect(resolveEngineIconUrl('https://images.google.com/search?q={query}', null)).toBe(
      DEFAULT_ENGINE_ICON_PATHS.google,
    );
    expect(
      resolveEngineIconUrl('https://support.duckduckgo.com/help/search?q={query}', null),
    ).toBe(DEFAULT_ENGINE_ICON_PATHS.duckduckgo);
    expect(
      resolveEngineIconUrl('https://help.foo.bing.com/pages/search?q={query}', null),
    ).toBe(DEFAULT_ENGINE_ICON_PATHS.bing);
  });

  it('不把相似主机名或嵌在参数里的地址误判为预置引擎', () => {
    expect(resolveEngineIconUrl('https://notgoogle.com/search?q={query}', null)).toBeNull();
    expect(resolveEngineIconUrl('https://google.com.evil.com/search?q={query}', null)).toBeNull();
    expect(resolveEngineIconUrl('https://duckduckgo.com.example/search?q={query}', null)).toBeNull();
    expect(
      resolveEngineIconUrl('https://example.com/?next=https://google.com/search?q={query}', null),
    ).toBeNull();
    expect(resolveEngineIconUrl('https://google.com.hk/search?q={query}', null)).toBeNull();
  });

  it('用户配置了图标 URL 时优先使用该地址', () => {
    expect(resolveEngineIconUrl(GOOGLE, 'https://cdn.example/g.png')).toBe(
      'https://cdn.example/g.png',
    );
    expect(resolveEngineIconUrl(GOOGLE, 'https://www.google.com/favicon.ico')).toBe(
      'https://www.google.com/favicon.ico',
    );
    expect(resolveEngineIconUrl(DDG_WWW, 'https://cdn.example/d.png')).toBe(
      'https://cdn.example/d.png',
    );
    expect(resolveEngineIconUrl(CUSTOM, 'https://cdn.example/c.png')).toBe(
      'https://cdn.example/c.png',
    );
    expect(
      resolveEngineIconUrl(CUSTOM, 'data:image/png;base64,iVBORw0KGgo='),
    ).toBe('data:image/png;base64,iVBORw0KGgo=');
  });

  it('非预置引擎未配置时没有回退图标', () => {
    expect(resolveEngineIconUrl(CUSTOM, null)).toBeNull();
    expect(isConfiguredEngineIcon(CUSTOM, null)).toBe(false);
    expect(isConfiguredEngineIcon(CUSTOM, 'https://cdn.example/c.png')).toBe(true);
  });
});

describe('engineIconFieldValue', () => {
  it('未配置时编辑框留空，已配置时回填用户 URL', () => {
    expect(engineIconFieldValue(GOOGLE, null)).toBe('');
    expect(engineIconFieldValue(GOOGLE, DEFAULT_ENGINE_ICON_PATHS.google)).toBe('');
    expect(engineIconFieldValue(DDG_WWW, null)).toBe('');
    expect(engineIconFieldValue(GOOGLE, 'https://cdn.example/g.png')).toBe(
      'https://cdn.example/g.png',
    );
    expect(engineIconFieldValue(GOOGLE, 'https://www.google.com/favicon.ico')).toBe(
      'https://www.google.com/favicon.ico',
    );
  });
});
