import postgres from 'postgres';

/**
 * Integration tests run against their own database so a test run can never
 * delete the data in your development workspace.
 *
 * Override with TEST_DATABASE_URL. The database is created if it does not
 * exist and migrated before the first test file runs.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://dev:dev@127.0.0.1:5433/spiderweb_test';

function adminUrl(url: string): { admin: string; database: string } {
  const parsed = new URL(url);
  const database = parsed.pathname.replace(/^\//, '');
  parsed.pathname = '/postgres';
  return { admin: parsed.toString(), database };
}

export async function ensureTestDatabase(): Promise<boolean> {
  const { admin, database } = adminUrl(TEST_DATABASE_URL);
  let root: postgres.Sql;
  try {
    root = postgres(admin, { max: 1, onnotice: () => {}, connect_timeout: 5 });
    const existing = await root`SELECT 1 FROM pg_database WHERE datname = ${database}`;
    if (existing.length === 0) {
      await root.unsafe(`CREATE DATABASE "${database.replace(/"/g, '""')}"`);
    }
    await root.end();
  } catch {
    return false;
  }

  const { runMigrations } = await import('../../packages/database/src/migrate.js');
  await runMigrations(TEST_DATABASE_URL);
  return true;
}
