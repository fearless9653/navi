// PBKDF2 密码哈希（Web Crypto，Node 与 Workers 均原生支持）。
// ⚠️ 迭代数上限被 Workers 钉死在 100000：Cloudflare 的 Web Crypto 对 PBKDF2 硬性限制
// iterations ≤ 100000，超过即抛 `NotSupportedError: iteration counts above 100000 are not
// supported`（Node/OpenSSL 无此限制，故只在 D1 上暴露）。双栈对等要求两端同一常量，
// 因此这里就是 PBKDF2 在本项目能取的强度天花板，**不要再往上调**（要更强需换 KDF，
// 且须两端都支持）。哈希串自带迭代数，未来若换算法可靠 needsRehash 平滑升级。
const ITER = 100_000;
const KEYLEN = 32; // bytes
const DIGEST = 'SHA-256';
const enc = new TextEncoder();

function b64(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}

function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const o = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i);
  return o;
}

async function derive(password: string, salt: Uint8Array, iter: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: iter, hash: DIGEST },
    key,
    KEYLEN * 8,
  );
  return new Uint8Array(bits);
}

/** 生成 `pbkdf2$<iter>$<saltB64>$<hashB64>` 形式的密码哈希。 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITER);
  return `pbkdf2$${ITER}$${b64(salt)}$${b64(hash)}`;
}

/** 常数时间校验密码。串格式非法返回 false。 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const p = stored.split('$');
  if (p.length !== 4 || p[0] !== 'pbkdf2') return false;
  const iter = Number(p[1]);
  if (!Number.isInteger(iter) || iter <= 0) return false;
  const actual = await derive(password, unb64(p[2]!), iter);
  const expected = unb64(p[3]!);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i]! ^ expected[i]!;
  return diff === 0;
}

/** 存储哈希是否需要升级（格式非法或迭代数低于当前目标）。用于登录成功后按需静默 rehash。 */
export function needsRehash(stored: string): boolean {
  const p = stored.split('$');
  if (p.length !== 4 || p[0] !== 'pbkdf2') return true;
  const iter = Number(p[1]);
  return !Number.isInteger(iter) || iter < ITER;
}
