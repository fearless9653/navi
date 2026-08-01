/**
 * SSRF 防护：URL / IP 纯函数校验（Node 与 Workers 通用）。
 * 注意：host 为域名时，这里只拦截显式的 localhost；真正的 DNS 复核在 fetcher 侧
 * （解析出的每个地址再过 isBlockedAddress），以防 DNS rebinding。
 */

/** IPv4 私网 / 环回 / 链路本地 / CGNAT / 保留 / 多播。 */
export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = nums as [number, number, number, number];
  if (a === 0) return true; // 0.0.0.0/8 "本网络"
  if (a === 10) return true; // 10/8
  if (a === 127) return true; // 环回
  if (a === 169 && b === 254) return true; // 链路本地（含云元数据 169.254.169.254）
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a >= 224) return true; // 多播/保留 224+
  return false;
}

/** IPv6 环回 / 未指定 / 链路本地 / ULA / IPv4-mapped（递归判私网）。 */
export function isPrivateIPv6(ip: string): boolean {
  const g = expandIPv6(ip);
  if (!g) return false;
  const at = (i: number) => g[i] ?? 0;
  if (g.every((x) => x === 0)) return true; // ::
  if (g.slice(0, 7).every((x) => x === 0) && at(7) === 1) return true; // ::1
  if ((at(0) & 0xffc0) === 0xfe80) return true; // fe80::/10 链路本地
  if ((at(0) & 0xfe00) === 0xfc00) return true; // fc00::/7 ULA
  // IPv4-mapped ::ffff:0:0/96
  if (g.slice(0, 5).every((x) => x === 0) && at(5) === 0xffff) {
    const a = (at(6) >> 8) & 0xff;
    const b = at(6) & 0xff;
    const c = (at(7) >> 8) & 0xff;
    const d = at(7) & 0xff;
    return isPrivateIPv4(`${a}.${b}.${c}.${d}`);
  }
  return false;
}

/** 把 IPv6 字符串展开为 8 个 16 位组；非法返回 null。处理 `::` 缩写与末尾内嵌 IPv4。 */
function expandIPv6(ip: string): number[] | null {
  let s = ip.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
  const v4m = s.match(/^(.*:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4m) {
    const v4 = v4m[2]!.split('.').map(Number);
    if (v4.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    const h1 = ((v4[0]! << 8) | v4[1]!).toString(16);
    const h2 = ((v4[2]! << 8) | v4[3]!).toString(16);
    s = `${v4m[1]!}${h1}:${h2}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  let groups: string[];
  if (halves.length === 1) {
    groups = head;
  } else {
    const missing = 8 - head.length - tail.length;
    if (missing < 0) return null;
    groups = [...head, ...Array<string>(missing).fill('0'), ...tail];
  }
  if (groups.length !== 8) return null;
  const nums = groups.map((h) => parseInt(h || '0', 16));
  if (nums.some((n) => Number.isNaN(n) || n < 0 || n > 0xffff)) return null;
  return nums;
}

/** 一个 IP 字面量是否应被拦截（v4 或 v6）。 */
export function isBlockedAddress(ip: string): boolean {
  return ip.includes(':') ? isPrivateIPv6(ip) : isPrivateIPv4(ip);
}

function isIpLiteral(host: string): boolean {
  return host.includes(':') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

/**
 * 校验 URL 安全：仅 http/https、无凭据、host 非 localhost、IP 字面量非私网。
 * 安全则返回解析后的 URL；否则抛错。
 */
export function assertSafeUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error('invalid_url');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('scheme_not_allowed');
  if (url.username || url.password) throw new Error('credentials_not_allowed');

  const host = url.hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host === '') {
    throw new Error('host_blocked');
  }
  if (isIpLiteral(host) && isBlockedAddress(host)) throw new Error('host_blocked');
  return url;
}
