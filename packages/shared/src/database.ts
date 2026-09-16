import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@intel/database';

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let sql: ReturnType<typeof postgres> | null = null;

export function getDb() {
  if (!db) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is required');
    }
    sql = postgres(databaseUrl, { max: 10 });
    db = drizzle(sql, { schema });
  }
  return db;
}

/**
 * Parameterized raw SQL query. Values are passed separately — never
 * string-interpolated — so user input can't reach the SQL parser.
 * Returns rows as plain objects (postgres.js RowList is array-like).
 */
export async function query(
  text: string,
  params: readonly unknown[] = []
): Promise<any[]> {
  if (!sql) getDb();
  const rows = await sql!.unsafe(text, params as postgres.ParameterOrJSON<never>[]);
  return rows as unknown as any[];
}

export async function closeDb() {
  if (sql) {
    await sql.end();
    sql = null;
    db = null;
  }
}
