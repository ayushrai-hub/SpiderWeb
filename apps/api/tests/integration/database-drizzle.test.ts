import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb, closeDb } from '@intel/shared';

describe('Database Integration', () => {
  let db: ReturnType<typeof getDb>;

  beforeAll(() => {
    db = getDb();
  });

  afterAll(async () => {
    await closeDb();
  });

  it('can connect to database', async () => {
    expect(db).toBeDefined();
  });

  it('can execute raw query', async () => {
    const result = await db.execute('SELECT 1 as value');
    expect(result).toBeDefined();
  });

  it('can insert and query data', async () => {
    const testId = '550e8400-e29b-41d4-a716-446655440099';
    const testEmail = 'dbtest@example.com';
    
    // Insert test user
    await db.execute(`INSERT INTO users (id, email, name) VALUES ('${testId}', '${testEmail}', 'DB Test User') ON CONFLICT DO NOTHING`);
    
    // Query test user
    const result = await db.execute(`SELECT * FROM users WHERE id = '${testId}'`);
    expect(result).toBeDefined();
  });
});
