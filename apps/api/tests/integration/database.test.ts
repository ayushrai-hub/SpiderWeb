import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';

describe('PostgreSQL Integration', () => {
  let sql: ReturnType<typeof postgres>;

  beforeAll(() => {
    const url = process.env.DATABASE_URL || 'postgresql://dev:dev@127.0.0.1:5432/intel_dev';
    sql = postgres(url, { max: 1 });
  });

  afterAll(async () => {
    if (sql) await sql.end();
  });

  it('connects to PostgreSQL', async () => {
    const result = await sql`SELECT 1 as value`;
    expect(result[0].value).toBe(1);
  });

  it('can create and query tables', async () => {
    await sql`CREATE TABLE IF NOT EXISTS test_integration (id SERIAL PRIMARY KEY, name TEXT NOT NULL)`;

    await sql`INSERT INTO test_integration (name) VALUES ('test')`;

    const result = await sql`SELECT name FROM test_integration WHERE name = 'test'`;
    expect(result[0].name).toBe('test');

    await sql`DROP TABLE test_integration`;
  });

  it('has pgvector extension', async () => {
    const result = await sql`
      SELECT exists(
        SELECT 1 FROM pg_extension WHERE extname = 'vector'
      ) as has_vector
    `;
    expect(result[0].has_vector).toBe(true);
  });
});
