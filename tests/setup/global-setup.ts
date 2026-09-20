import { ensureTestDatabase } from './test-database.js';

/** Creates and migrates the throwaway test database once per run. */
export default async function setup(): Promise<void> {
  const ready = await ensureTestDatabase();
  if (!ready) {
    console.warn(
      '\n[tests] No Postgres reachable — integration tests will be skipped.\n' +
        '        Start it with `docker compose up -d`.\n'
    );
  }
}
