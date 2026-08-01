import { ApiException } from '@/api/client';

/** 后端数量上限错误体：{ error: 'limit_exceeded', resource, limit }。 */
export interface LimitExceeded {
  resource: 'bookmarks' | 'tags' | 'engines';
  limit: number;
}

/** 若 e 是数量上限（409 limit_exceeded）错误则返回 { resource, limit }，否则 null。 */
export function asLimitError(e: unknown): LimitExceeded | null {
  if (!(e instanceof ApiException) || e.status !== 409) return null;
  const body = e.body as { error?: string; resource?: string; limit?: number } | null;
  if (!body || body.error !== 'limit_exceeded') return null;
  if (
    (body.resource === 'bookmarks' || body.resource === 'tags' || body.resource === 'engines') &&
    typeof body.limit === 'number'
  ) {
    return { resource: body.resource, limit: body.limit };
  }
  return null;
}
