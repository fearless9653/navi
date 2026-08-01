export interface RateLimiter {
  /** 记录一次尝试并判断是否放行。 */
  check(key: string, now?: number): { ok: boolean; retryAfterMs?: number };
  /** 清空某 key 的计数（如登录成功后）。 */
  reset(key: string): void;
}

/**
 * 内存滑动窗口登录限流器。
 * 注意：Workers 上为单 isolate best-effort，需配合 Cloudflare 边缘限流；
 * 如需跨实例持久化，可在部署计划替换为 KV/DB 实现（保持本接口不变）。
 */
export function createLoginRateLimiter(opts: { max: number; windowMs: number }): RateLimiter {
  const hits = new Map<string, number[]>();
  /** key 数量超过阈值时清扫整窗过期的条目，防止长期运行下内存无界增长。 */
  const SWEEP_THRESHOLD = 10_000;
  function sweep(now: number): void {
    if (hits.size < SWEEP_THRESHOLD) return;
    for (const [key, arr] of hits.entries()) {
      if (arr.every((t) => now - t >= opts.windowMs)) hits.delete(key);
    }
  }
  return {
    check(key, now = Date.now()) {
      sweep(now);
      const arr = (hits.get(key) ?? []).filter((t) => now - t < opts.windowMs);
      if (arr.length >= opts.max) {
        hits.set(key, arr);
        const retryAfterMs = opts.windowMs - (now - arr[0]!);
        return { ok: false, retryAfterMs };
      }
      arr.push(now);
      hits.set(key, arr);
      return { ok: true };
    },
    reset(key) {
      hits.delete(key);
    },
  };
}
