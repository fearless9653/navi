const ILLEGAL_INVOCATION =
  'Illegal invocation: function called with incorrect `this` reference. See https://developers.cloudflare.com/workers/observability/errors/ for details.';

/** 把 globalThis.fetch 换成校验 this === globalThis 的桩；返回还原函数。不发起真实网络。 */
export function installStrictGlobalFetch(
  impl: (...args: Parameters<typeof fetch>) => Response | Promise<Response>,
): () => void {
  const previous = globalThis.fetch;
  const strict = function (this: unknown, ...args: Parameters<typeof fetch>): Promise<Response> {
    if (this !== globalThis) {
      throw new TypeError(ILLEGAL_INVOCATION);
    }
    return Promise.resolve(impl(...args));
  };
  globalThis.fetch = strict as typeof fetch;
  return () => {
    globalThis.fetch = previous;
  };
}

export { ILLEGAL_INVOCATION };
