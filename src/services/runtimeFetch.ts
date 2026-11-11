/** 按运行时正确接收者解析 fetch，供 Node 与 Workers 共用。不在模块顶层发起 I/O。 */
export function resolveFetch(fetchImpl?: typeof fetch): typeof fetch {
  if (!fetchImpl || fetchImpl === globalThis.fetch) {
    // 调用时再访问全局 fetch，并以 globalThis 为接收者，避免 Illegal invocation。
    return (input, init) => globalThis.fetch(input, init);
  }
  // 其它注入实现原样返回，由调用方裸调，保留其自身 this 契约（如 Node undici dispatcher）。
  return fetchImpl;
}
