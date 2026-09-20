import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@intel/database';

let sql: postgres.Sql | null = null;
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export interface DbOptions {
  max?: number;
  connectionUrl?: string;
}

/**
 * The postgres.js client. Prefer this over `query()` for bulk inserts and
 * transactions; the tagged-template API parameterises values automatically.
 */
export function getSql(options: DbOptions = {}): postgres.Sql {
  if (!sql) {
    const url = options.connectionUrl ?? process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    sql = postgres(url, {
      max: options.max ?? 10,
      // Imports run long multi-statement transactions; the default 30s is tight.
      idle_timeout: 30,
      max_lifetime: 60 * 30,
      onnotice: () => {},
    });
  }
  return sql;
}

export function getDb() {
  if (!db) db = drizzle(getSql(), { schema });
  return db;
}

/**
 * Parameterised raw SQL. `params` are bound by the driver, never interpolated,
 * so caller-supplied values can never reach the SQL parser.
 */
export async function query<T = Record<string, unknown>>(
  text: string,
  params: readonly unknown[] = []
): Promise<T[]> {
  const client = getSql();
  const rows = await client.unsafe(text, params as never[]);
  return rows as unknown as T[];
}

/** Run `fn` inside a transaction; rolls back on any thrown error. */
export async function transaction<T>(fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return getSql().begin(fn) as Promise<T>;
}

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await getSql()`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export async function closeDb(): Promise<void> {
  if (sql) {
    await sql.end({ timeout: 5 });
    sql = null;
    db = null;
  }
}
