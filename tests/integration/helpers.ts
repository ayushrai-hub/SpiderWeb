import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Set by tests/setup/setup-files.ts to the throwaway test database. */
export const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://dev:dev@127.0.0.1:5433/spiderweb_test';

let shared: postgres.Sql | null = null;

export function sql(): postgres.Sql {
  if (!shared) shared = postgres(DATABASE_URL, { max: 4, onnotice: () => {} });
  return shared;
}

export async function closeSql(): Promise<void> {
  if (shared) {
    await shared.end({ timeout: 5 });
    shared = null;
  }
}

/** True when a Postgres with the SpiderWeb schema is reachable. */
export async function databaseAvailable(): Promise<boolean> {
  try {
    const rows = await sql()<{ ok: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'people' AND column_name = 'dedupe_key'
      ) AS ok
    `;
    return rows[0]?.ok === true;
  } catch {
    return false;
  }
}

export interface TestWorkspace {
  userId: string;
  workspaceId: string;
  cleanup: () => Promise<void>;
}

export async function createTestWorkspace(label = 'test'): Promise<TestWorkspace> {
  const db = sql();
  const userId = randomUUID();
  const workspaceId = randomUUID();
  const suffix = workspaceId.slice(0, 8);
  await db`INSERT INTO users (id, email, name) VALUES (${userId}, ${`${label}-${suffix}@test.local`}, ${`Test ${label}`})`;
  await db`INSERT INTO workspaces (id, name, slug, owner_id) VALUES (${workspaceId}, ${`WS ${suffix}`}, ${`ws-${suffix}`}, ${userId})`;
  await db`INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (${workspaceId}, ${userId}, 'owner')`;
  return {
    userId,
    workspaceId,
    async cleanup() {
      // Every workspace-owned table cascades from workspaces.
      await db`DELETE FROM workspaces WHERE id = ${workspaceId}`;
      await db`DELETE FROM users WHERE id = ${userId}`;
    },
  };
}

export async function createImportRow(
  workspaceId: string,
  filename: string,
  userId?: string
): Promise<string> {
  const id = randomUUID();
  await sql()`
    INSERT INTO imports (id, workspace_id, created_by, source_type, status, filename)
    VALUES (${id}, ${workspaceId}, ${userId ?? null}, 'linkedin', 'pending', ${filename})
  `;
  return id;
}

/** Write bytes to a fresh temp dir and return { dir, path }. */
export function writeTempFile(
  name: string,
  bytes: Uint8Array | string
): { dir: string; path: string; remove: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'spiderweb-test-'));
  const path = join(dir, name);
  writeFileSync(path, bytes);
  return { dir, path, remove: () => rmSync(dir, { recursive: true, force: true }) };
}

export function tempDir(): { dir: string; remove: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'spiderweb-extract-'));
  return { dir, remove: () => rmSync(dir, { recursive: true, force: true }) };
}
