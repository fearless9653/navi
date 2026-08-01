export interface ServerEnv {
  NODE_ENV?: string;
  SECURE_COOKIES?: string;
}

export function resolveSecureCookie(env: ServerEnv): boolean {
  const raw = env.SECURE_COOKIES?.trim().toLowerCase();
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return env.NODE_ENV === 'production';
}
