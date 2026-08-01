// 音频文件本地缓存。利用 Cache API 把音频持久化到磁盘，
// 跨刷新 / 重开浏览器复用，避免每次都从 OSS 重新拉取。
//
// 注意：fetch 读取字节需要 OSS 配置 CORS（返回 Access-Control-Allow-Origin）。
// 若 OSS 未开启 CORS 或浏览器不支持 Cache API，会优雅回退到直链播放（不缓存）。

const CACHE_NAME = 'navi-audio-v1';

function supported(): boolean {
  return typeof caches !== 'undefined';
}

// 串行化批量缓存操作（预取 / 清理）。两者都会遍历并增删整个缓存，
// 并发执行可能互相误删：清理按旧歌单删除时，预取正按新歌单写入。
// 用一条 Promise 链保证它们按调用顺序逐个执行，永不交叠。
// 注意：按需播放路径 resolveAudioUrl 故意不入队——它在播放热路径上，
// 不能被一次长时间预取阻塞；且它只写当前曲目（必在歌单内），不与清理冲突。
let opChain: Promise<unknown> = Promise.resolve();

function enqueue<T>(op: () => Promise<T>): Promise<T> {
  const run = opChain.then(op, op);
  // 链上不传播错误，单次操作失败不阻断后续；调用方各自 catch。
  opChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * 解析出缓存中的音频 Blob：命中缓存则直接返回，
 * 未命中则下载并写入缓存后返回；失败时返回 null。
 */
export async function resolveAudioBlob(url: string): Promise<Blob | null> {
  if (!supported()) return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    let response = await cache.match(url);
    if (!response) {
      const fetched = await fetch(url, { mode: 'cors' });
      if (!fetched.ok) return null;
      await cache.put(url, fetched.clone());
      response = fetched;
    }
    return await response.blob();
  } catch {
    return null;
  }
}

/**
 * 解析出可播放的音频地址：可缓存则返回本地 blob URL；失败时回退原始直链。
 *
 * 返回的 blob URL 由调用方负责在不再使用时 URL.revokeObjectURL()。
 * 若返回的是原始直链（== 入参 url），则无需 revoke。
 */
export async function resolveAudioUrl(url: string): Promise<string> {
  const blob = await resolveAudioBlob(url);
  return blob ? URL.createObjectURL(blob) : url;
}

/**
 * 后台预取整张歌单到缓存（已缓存的跳过）。串行下载，避免与当前播放曲目
 * 争抢带宽；单首失败不影响其余。调用方无需 await，发起即可。
 */
export async function prefetchAudio(urls: string[]): Promise<void> {
  if (!supported()) return;
  await enqueue(async () => {
    const cache = await caches.open(CACHE_NAME);
    for (const url of urls) {
      if (await cache.match(url)) continue;
      try {
        const res = await fetch(url, { mode: 'cors' });
        if (res.ok) await cache.put(url, res);
      } catch {
        // 单首预取失败忽略，继续下一首
      }
    }
  }).catch(() => {
    // 忽略：预取失败不影响按需播放
  });
}

/** 删除缓存中不在 keepUrls 内的条目，防止歌单变更后缓存无限增长。 */
export async function pruneAudioCache(keepUrls: string[]): Promise<void> {
  if (!supported()) return;
  await enqueue(async () => {
    const cache = await caches.open(CACHE_NAME);
    const keep = new Set(keepUrls);
    const keys = await cache.keys();
    await Promise.all(keys.map((req) => (keep.has(req.url) ? null : cache.delete(req))));
  }).catch(() => {
    // 忽略：缓存清理失败不影响播放
  });
}
