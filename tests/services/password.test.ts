import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, needsRehash } from '@/services/password';

describe('password', () => {
  it('hash 不等于明文且形如 pbkdf2$', async () => {
    const h = await hashPassword('secret123');
    expect(h).not.toBe('secret123');
    expect(h.startsWith('pbkdf2$')).toBe(true);
  });

  it('正确密码 verify 通过，错误不通过', async () => {
    const h = await hashPassword('secret123');
    expect(await verifyPassword('secret123', h)).toBe(true);
    expect(await verifyPassword('wrong', h)).toBe(false);
  });

  it('同一密码两次 hash 盐不同，但都能 verify', async () => {
    const h1 = await hashPassword('pw');
    const h2 = await hashPassword('pw');
    expect(h1).not.toBe(h2);
    expect(await verifyPassword('pw', h1)).toBe(true);
    expect(await verifyPassword('pw', h2)).toBe(true);
  });

  it('损坏的串返回 false', async () => {
    expect(await verifyPassword('x', 'garbage')).toBe(false);
  });

  it('needsRehash：低迭代 / 非法格式需升级，当前强度不需要', async () => {
    expect(needsRehash('garbage')).toBe(true);
    expect(needsRehash('pbkdf2$50000$c2FsdA==$aGFzaA==')).toBe(true); // 更低的历史迭代
    // 10 万迭代即当前强度（受 Workers PBKDF2 上限约束，不再上调），不需升级
    expect(needsRehash('pbkdf2$100000$c2FsdA==$aGFzaA==')).toBe(false);
    const fresh = await hashPassword('pw');
    expect(needsRehash(fresh)).toBe(false);
  });
});
