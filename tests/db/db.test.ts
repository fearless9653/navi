import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../helpers/testDb';
import { users } from '@/db/schema';

describe('db round-trip', () => {
  it('插入并查询 user，审计字段自动填充', () => {
    const db = createTestDb();
    db.insert(users)
      .values({
        email: 'admin@example.com',
        passwordHash: 'x',
        displayName: 'Admin',
        isAdmin: true,
      })
      .run();

    const row = db.select().from(users).where(eq(users.email, 'admin@example.com')).get();
    expect(row).toBeDefined();
    expect(row!.isAdmin).toBe(true);
    expect(row!.isActive).toBe(true);
    expect(row!.createdDate).toBeInstanceOf(Date);
  });

  it('email 唯一约束生效', () => {
    const db = createTestDb();
    const v = { email: 'dup@example.com', passwordHash: 'x', displayName: 'A' };
    db.insert(users).values(v).run();
    expect(() => db.insert(users).values(v).run()).toThrow();
  });
});
