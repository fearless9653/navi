/** 三个预置搜索引擎的站点本地图标。 */

export const DEFAULT_ENGINE_ICON_PATHS = {
  google: '/icons/engines/google.png',
  bing: '/icons/engines/bing.png',
  duckduckgo: '/icons/engines/duckduckgo.png',
} as const;

interface DefaultEngineIcon {
  urlTemplate: string;
  iconPath: string;
}

const DEFAULT_ENGINE_ICONS: readonly DefaultEngineIcon[] = [
  {
    urlTemplate: 'https://www.google.com/search?q={query}',
    iconPath: DEFAULT_ENGINE_ICON_PATHS.google,
  },
  {
    urlTemplate: 'https://www.bing.com/search?q={query}',
    iconPath: DEFAULT_ENGINE_ICON_PATHS.bing,
  },
  {
    urlTemplate: 'https://duckduckgo.com/?q={query}',
    iconPath: DEFAULT_ENGINE_ICON_PATHS.duckduckgo,
  },
];

/** 取出主机名：小写、去掉尾点和前导 www.。解析失败返回 null。 */
function hostnameOf(urlTemplate: string): string | null {
  try {
    const host = new URL(urlTemplate.trim()).hostname.toLowerCase().replace(/\.$/, '');
    if (!host) return null;
    return host.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** 预置引擎的注册域。三个默认地址都是 *.com，用最后两段即可，不必引入公共后缀表。 */
function registrableDomainOf(hostname: string): string | null {
  const parts = hostname.split('.').filter(Boolean);
  if (parts.length < 2) return null;
  return parts.slice(-2).join('.');
}

/**
 * 按注册域匹配：相同一级域名或其子域（含帮助页等更深层级）算同一个预置引擎。
 * 用点边界判断，避免 notgoogle.com 这类字符串误伤；不看路径和协议。
 */
function templateMatches(urlTemplate: string, defaultTemplate: string): boolean {
  const actualHost = hostnameOf(urlTemplate);
  const defaultHost = hostnameOf(defaultTemplate);
  if (!actualHost || !defaultHost) return false;
  const domain = registrableDomainOf(defaultHost);
  if (!domain) return false;
  return actualHost === domain || actualHost.endsWith(`.${domain}`);
}

function findDefault(urlTemplate: string): DefaultEngineIcon | undefined {
  return DEFAULT_ENGINE_ICONS.find((d) => templateMatches(urlTemplate, d.urlTemplate));
}

function normalizedIconUrl(iconUrl: string | null | undefined): string | null {
  const trimmed = iconUrl?.trim();
  return trimmed ? trimmed : null;
}

/** 是否为用户主动配置的图标（空和本地默认路径不算）。 */
export function isConfiguredEngineIcon(
  urlTemplate: string,
  iconUrl: string | null | undefined,
): boolean {
  const custom = normalizedIconUrl(iconUrl);
  if (!custom) return false;
  const def = findDefault(urlTemplate);
  if (!def) return true;
  return custom !== def.iconPath;
}

/** 显示用图标：预置引擎未配置时用本地图，已配置则用用户填写的 URL。 */
export function resolveEngineIconUrl(
  urlTemplate: string,
  iconUrl: string | null | undefined,
): string | null {
  const custom = normalizedIconUrl(iconUrl);
  const def = findDefault(urlTemplate);
  if (!def) return custom;
  if (!isConfiguredEngineIcon(urlTemplate, custom)) return def.iconPath;
  return custom;
}

/** 编辑表单里只展示用户自己填的地址；未配置时留空。 */
export function engineIconFieldValue(
  urlTemplate: string,
  iconUrl: string | null | undefined,
): string {
  return isConfiguredEngineIcon(urlTemplate, iconUrl) ? (normalizedIconUrl(iconUrl) ?? '') : '';
}
