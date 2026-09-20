/**
 * Migration runner.
 *
 * Applies every `drizzle/*.sql` file in filename order exactly once and records
 * it in `schema_migrations`. Each file runs inside a transaction, so a failure
 * leaves the database untouched and the run aborts loudly.
 *
 * The drizzle-kit journal was previously the source of truth and had drifted
 * from the database (files existed that the journal never listed, so they were
 * silently never applied). This runner reads the directory itself.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import postgres from 'postgres';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'drizzle');

/** The first migration predates this runner; a database that already has the
 *  baseline tables is marked as having applied it rather than re-running it. */
const BASELINE = '0000_glamorous_texas_twister.sql';

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

export async function runMigrations(databaseUrl: string): Promise<MigrationResult> {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  const applied: string[] = [];
  const skipped: string[] = [];
  let baselined = false;

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `;

    const alreadyApplied = new Set(
      (await sql<{ filename: string }[]>`SELECT filename FROM schema_migrations`).map((r) => r.filename)
    );

    // Baseline: an existing database created before this runner.
    if (!alreadyApplied.has(BASELINE)) {
      const [{ exists }] = await sql<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'people'
        ) AS exists
      `;
      if (exists) {
        await sql`
          INSERT INTO schema_migrations (filename, checksum)
          VALUES (${BASELINE}, ${checksumOf(BASELINE)})
          ON CONFLICT DO NOTHING
        `;
        alreadyApplied.add(BASELINE);
        baselined = true;
      }
    }

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (alreadyApplied.has(file)) {
        skipped.push(baselined && file === BASELINE ? `${file} (baseline: tables already present)` : file);
        continue;
      }
      const body = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`
          INSERT INTO schema_migrations (filename, checksum)
          VALUES (${file}, ${createHash('sha256').update(body).digest('hex')})
        `;
      });
      applied.push(file);
    }

    return { applied, skipped };
  } finally {
    await sql.end();
  }
}

function checksumOf(file: string): string {
  return createHash('sha256')
    .update(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))
    .digest('hex');
}

// CLI entrypoint: `pnpm --filter @intel/database migrate`
if (process.argv[1] && process.argv[1].endsWith('migrate.ts')) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required to run migrations.');
    process.exit(1);
  }
  runMigrations(url)
    .then(({ applied, skipped }) => {
      for (const f of skipped) console.log(`  skip   ${f}`);
      for (const f of applied) console.log(`  apply  ${f}`);
      console.log(applied.length ? `\n${applied.length} migration(s) applied.` : '\nDatabase is up to date.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('\nMigration failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
