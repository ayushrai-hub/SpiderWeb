import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runImport } from '../../packages/ingestion/src/runner';
import {
  CONNECTIONS_V1,
  CONNECTIONS_V2,
  buildArchive,
  buildIrrelevantArchive,
  connectionsCsv,
  largeConnections,
} from '../fixtures/linkedin-export';
import {
  closeSql,
  createImportRow,
  createTestWorkspace,
  databaseAvailable,
  sql,
  tempDir,
  writeTempFile,
  type TestWorkspace,
} from './helpers';

const available = await databaseAvailable();
const describeDb = available ? describe : describe.skip;

if (!available) {
  console.warn(
    'Skipping import pipeline integration tests: no database with the SpiderWeb schema at DATABASE_URL.'
  );
}

async function importArchive(ws: TestWorkspace, bytes: Uint8Array, filename = 'export.zip') {
  const upload = writeTempFile(filename, bytes);
  const temp = tempDir();
  const importId = await createImportRow(ws.workspaceId, filename, ws.userId);
  try {
    const outcome = await runImport({
      sql: sql(),
      workspaceId: ws.workspaceId,
      importId,
      files: [{ path: upload.path, filename }],
      uploadDir: upload.dir,
      tempDir: temp.dir,
    });
    return { outcome, importId };
  } finally {
    upload.remove();
    temp.remove();
  }
}

afterAll(async () => {
  await closeSql();
});

describeDb('LinkedIn import pipeline', () => {
  let ws: TestWorkspace;
  let first: Awaited<ReturnType<typeof importArchive>>;

  beforeAll(async () => {
    ws = await createTestWorkspace('pipeline');
    first = await importArchive(ws, buildArchive());
  });

  afterAll(async () => {
    await ws.cleanup();
  });

  it('completes and reports what happened', () => {
    expect(first.outcome.status).toBe('completed');
    expect(first.outcome.errors).toEqual([]);
    expect(first.outcome.recordsDiscovered).toBeGreaterThan(0);
    expect(first.outcome.recordsImported).toBeGreaterThan(0);
    expect(first.outcome.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('stores one person per unique connection plus the archive owner', async () => {
    const [{ count }] = await sql()<{ count: number }[]>`
      SELECT count(*)::int AS count FROM people WHERE workspace_id = ${ws.workspaceId} AND NOT is_self
    `;
    // 12 connection rows, one a duplicate of Jane Smith, plus Noor Haddad who
    // appears only as an outgoing invitation. Grace Okonkwo appears in both
    // Connections.csv and Recommendations_Received.csv and must not double up.
    expect(count).toBe(12);

    const [self] = await sql()<{ canonical_name: string; industry: string }[]>`
      SELECT canonical_name, industry FROM people WHERE workspace_id = ${ws.workspaceId} AND is_self
    `;
    expect(self.canonical_name).toBe('Alex Rivera');
    expect(self.industry).toBe('Software Development');
  });

  it('records one connection per person', async () => {
    const [{ count }] = await sql()<{ count: number }[]>`
      SELECT count(*)::int AS count FROM connections WHERE workspace_id = ${ws.workspaceId}
    `;
    expect(count).toBe(11);
  });

  it('merges a person who appears with and without a profile URL', async () => {
    const graces = await sql()<{ dedupe_key: string }[]>`
      SELECT dedupe_key FROM people
      WHERE workspace_id = ${ws.workspaceId} AND canonical_name = 'Grace Okonkwo'
    `;
    expect(graces.map((g) => g.dedupe_key)).toEqual(['url:graceokonkwo']);
  });

  it('traces a specific person from CSV row to database row', async () => {
    const [jane] = await sql()<Record<string, string | null>[]>`
      SELECT canonical_name, first_name, last_name, profile_url, email, current_company,
             current_title, headline, to_char(connected_at, 'YYYY-MM-DD') AS connected
      FROM people WHERE workspace_id = ${ws.workspaceId} AND dedupe_key = 'url:janesmith'
    `;
    expect(jane).toMatchObject({
      canonical_name: 'Jane Smith',
      first_name: 'Jane',
      last_name: 'Smith',
      profile_url: 'https://www.linkedin.com/in/janesmith',
      email: 'jane.smith@example.com',
      current_company: 'Acme Corp',
      current_title: 'Senior Engineer',
      connected: '2023-01-01',
    });
  });

  it('merges companies that differ only by legal suffix and counts them', async () => {
    const [acme] = await sql()<{ canonical_name: string; connection_count: number; current_count: number }[]>`
      SELECT canonical_name, connection_count, current_count
      FROM companies WHERE workspace_id = ${ws.workspaceId} AND normalized_name = 'acme'
    `;
    // Jane (Acme Corp), Frank (Acme Corporation), Grace (Acme Corp) + the owner's
    // former role at Acme, which is excluded from connection counts.
    expect(acme.connection_count).toBe(3);
    expect(acme.current_count).toBe(3);
  });

  it('attaches the owner’s positions, education and skills to the owner only', async () => {
    const rows = await sql()<{ is_self: boolean; n: number }[]>`
      SELECT p.is_self, count(e.id)::int AS n
      FROM people p LEFT JOIN person_employment e ON e.person_id = p.id
      WHERE p.workspace_id = ${ws.workspaceId}
      GROUP BY p.is_self ORDER BY p.is_self
    `;
    const self = rows.find((r) => r.is_self)!;
    expect(self.n).toBe(3); // three Positions.csv rows

    const [{ count: eduCount }] = await sql()<{ count: number }[]>`
      SELECT count(*)::int AS count FROM education e
      JOIN people p ON p.id = e.person_id
      WHERE e.workspace_id = ${ws.workspaceId} AND p.is_self
    `;
    expect(eduCount).toBe(2);

    const [{ count: orphaned }] = await sql()<{ count: number }[]>`
      SELECT count(*)::int AS count FROM skills s
      JOIN people p ON p.id = s.person_id
      WHERE s.workspace_id = ${ws.workspaceId} AND NOT p.is_self
    `;
    expect(orphaned).toBe(0);
  });

  it('marks the owner’s open-ended position as their current role', async () => {
    const [self] = await sql()<{ current_company: string; current_title: string }[]>`
      SELECT current_company, current_title FROM people
      WHERE workspace_id = ${ws.workspaceId} AND is_self
    `;
    expect(self.current_company).toBe('Globex');
    expect(self.current_title).toBe('VP Engineering');
  });

  it('imports messages, links them to a person and derives direction', async () => {
    const [counts] = await sql()<{ total: number; inbound: number; outbound: number }[]>`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE direction = 'inbound')::int AS inbound,
             count(*) FILTER (WHERE direction = 'outbound')::int AS outbound
      FROM messages WHERE workspace_id = ${ws.workspaceId}
    `;
    expect(counts).toEqual({ total: 3, inbound: 2, outbound: 1 });

    const [jane] = await sql()<{ interaction_count: number; last_interaction_at: Date | null }[]>`
      SELECT interaction_count, last_interaction_at FROM people
      WHERE workspace_id = ${ws.workspaceId} AND dedupe_key = 'url:janesmith'
    `;
    // Two messages in conversation c-1001 plus one endorsement.
    expect(jane.interaction_count).toBe(3);
    expect(jane.last_interaction_at).not.toBeNull();
  });

  it('skips datasets it does not import and says why', async () => {
    const rows = await sql()<{ filename: string; status: string; reason: string }[]>`
      SELECT filename, status, reason FROM import_files WHERE import_id = ${first.importId} AND status = 'skipped'
    `;
    const ads = rows.find((r) => r.filename === 'Ads Clicked.csv');
    expect(ads?.reason).toMatch(/Advertising/);
    expect(rows.some((r) => r.filename === '.DS_Store')).toBe(true);
  });

  it('records a per-file breakdown for the import history', async () => {
    const rows = await sql()<
      { dataset: string; record_count: number; records_imported: number; status: string }[]
    >`
      SELECT dataset, record_count, records_imported, status FROM import_files
      WHERE import_id = ${first.importId} AND dataset IS NOT NULL ORDER BY dataset
    `;
    const connections = rows.find((r) => r.dataset === 'connections')!;
    expect(connections.record_count).toBe(CONNECTIONS_V1.length);
    expect(connections.records_imported).toBe(CONNECTIONS_V1.length);
    expect(connections.status).toBe('normalized');
    expect(rows.map((r) => r.dataset)).toEqual(
      expect.arrayContaining([
        'connections',
        'education',
        'messages',
        'positions',
        'skills',
        'job_applications',
      ])
    );
  });

  it('writes the summary onto the import row', async () => {
    const [row] = await sql()<Record<string, number | string>[]>`
      SELECT status, records_discovered, records_imported, records_duplicate, duration_ms
      FROM imports WHERE id = ${first.importId}
    `;
    expect(row.status).toBe('completed');
    expect(Number(row.records_discovered)).toBeGreaterThan(0);
    expect(Number(row.records_imported)).toBeGreaterThan(0);
  });

  it('is idempotent: re-importing the same archive creates nothing new', async () => {
    const before = await counts(ws.workspaceId);
    const second = await importArchive(ws, buildArchive());
    const after = await counts(ws.workspaceId);

    expect(second.outcome.status).toBe('completed');
    expect(after).toEqual(before);
    expect(second.outcome.stats.peopleCreated).toBe(0);
    expect(second.outcome.recordsDuplicate).toBeGreaterThan(0);
  });

  it('does not inflate interaction counters on re-import', async () => {
    const [jane] = await sql()<{ interaction_count: number }[]>`
      SELECT interaction_count FROM people
      WHERE workspace_id = ${ws.workspaceId} AND dedupe_key = 'url:janesmith'
    `;
    expect(jane.interaction_count).toBe(3);
  });
});

describeDb('incremental imports', () => {
  let ws: TestWorkspace;

  beforeAll(async () => {
    ws = await createTestWorkspace('incremental');
    await importArchive(ws, buildArchive());
    await importArchive(ws, buildArchive({ connections: CONNECTIONS_V2 }), 'export-2.zip');
  });

  afterAll(async () => {
    await ws.cleanup();
  });

  it('adds the new people without duplicating existing ones', async () => {
    const [{ count }] = await sql()<{ count: number }[]>`
      SELECT count(*)::int AS count FROM people WHERE workspace_id = ${ws.workspaceId} AND NOT is_self
    `;
    // 12 after the first import, plus Tom Riley. Noor Haddad was already
    // known from the outgoing invitation, so becoming a connection updates
    // her record rather than creating a second one.
    expect(count).toBe(13);
  });

  it('promotes a known invitee to a connection instead of duplicating them', async () => {
    const rows = await sql()<{ dedupe_key: string; connected: string | null }[]>`
      SELECT p.dedupe_key, to_char(c.connected_at, 'YYYY-MM-DD') AS connected
      FROM people p LEFT JOIN connections c ON c.person_id = p.id
      WHERE p.workspace_id = ${ws.workspaceId} AND p.canonical_name = 'Noor Haddad'
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].connected).toBe('2026-02-02');
  });

  it('updates a person who changed company and keeps the previous role as history', async () => {
    const [jane] = await sql()<{ current_company: string; current_title: string }[]>`
      SELECT current_company, current_title FROM people
      WHERE workspace_id = ${ws.workspaceId} AND dedupe_key = 'url:janesmith'
    `;
    expect(jane.current_company).toBe('Globex');
    expect(jane.current_title).toBe('Principal Engineer');

    const history = await sql()<{ company_name: string; is_current: boolean }[]>`
      SELECT e.company_name, e.is_current FROM person_employment e
      JOIN people p ON p.id = e.person_id
      WHERE p.dedupe_key = 'url:janesmith' AND e.workspace_id = ${ws.workspaceId}
      ORDER BY e.observed_at
    `;
    expect(history).toHaveLength(2);
    expect(history.map((h) => h.company_name)).toEqual(['Acme Corp', 'Globex']);
    expect(history.map((h) => h.is_current)).toEqual([false, true]);
  });

  it('exposes the job change as an observable career move', async () => {
    const movers = await sql()<{ dedupe_key: string }[]>`
      SELECT p.dedupe_key FROM people p
      JOIN person_employment e ON e.person_id = p.id
      WHERE p.workspace_id = ${ws.workspaceId}
      GROUP BY p.dedupe_key
      HAVING count(DISTINCT e.company_key) > 1
    `;
    expect(movers.map((m) => m.dedupe_key)).toContain('url:janesmith');
  });

  it('keeps notes and tags written between imports', async () => {
    const [{ id: personId }] = await sql()<{ id: string }[]>`
      SELECT id FROM people WHERE workspace_id = ${ws.workspaceId} AND dedupe_key = 'url:frankchen'
    `;
    await sql()`INSERT INTO person_notes (workspace_id, person_id, body) VALUES (${ws.workspaceId}, ${personId}, 'Met at KubeCon')`;
    const [{ id: tagId }] = await sql()<{ id: string }[]>`
      INSERT INTO tags (workspace_id, name) VALUES (${ws.workspaceId}, 'mentor') RETURNING id
    `;
    await sql()`INSERT INTO person_tags (person_id, tag_id, workspace_id) VALUES (${personId}, ${tagId}, ${ws.workspaceId})`;

    await importArchive(ws, buildArchive({ connections: CONNECTIONS_V2 }), 'export-3.zip');

    const notes = await sql()<
      { body: string }[]
    >`SELECT body FROM person_notes WHERE person_id = ${personId}`;
    const tagLinks = await sql()<
      { tag_id: string }[]
    >`SELECT tag_id FROM person_tags WHERE person_id = ${personId}`;
    expect(notes.map((n) => n.body)).toEqual(['Met at KubeCon']);
    expect(tagLinks).toHaveLength(1);
  });

  it('recomputes company rollups after the move', async () => {
    const rows = await sql()<{ normalized_name: string; current_count: number; former_count: number }[]>`
      SELECT normalized_name, current_count, former_count FROM companies
      WHERE workspace_id = ${ws.workspaceId} AND normalized_name IN ('acme', 'globex')
      ORDER BY normalized_name
    `;
    const acme = rows.find((r) => r.normalized_name === 'acme')!;
    const globex = rows.find((r) => r.normalized_name === 'globex')!;
    // Jane left Acme for Globex; Tom joined Acme.
    expect(acme.former_count).toBe(1);
    expect(globex.current_count).toBeGreaterThanOrEqual(3);
  });
});

describeDb('import failure modes', () => {
  let ws: TestWorkspace;
  beforeAll(async () => {
    ws = await createTestWorkspace('failures');
  });
  afterAll(async () => {
    await ws.cleanup();
  });

  it('fails clearly when the upload is not a ZIP or a LinkedIn CSV', async () => {
    const { outcome } = await importArchive(ws, Buffer.from('hello world'), 'notes.txt');
    expect(outcome.status).toBe('failed');
    expect(outcome.errorCode).toBe('NO_LINKEDIN_DATA');
    expect(outcome.errors[0]).toMatch(/LinkedIn export/);
  });

  it('fails clearly when a ZIP contains nothing importable', async () => {
    const { outcome } = await importArchive(ws, buildIrrelevantArchive(), 'wrong.zip');
    expect(outcome.status).toBe('failed');
    expect(outcome.errorCode).toBe('NO_LINKEDIN_DATA');
  });

  it('rejects a corrupted archive with a usable message', async () => {
    const full = buildArchive();
    const { outcome } = await importArchive(ws, full.slice(0, 200), 'broken.zip');
    expect(outcome.status).toBe('failed');
    expect(outcome.errors[0]).toMatch(/corrupt|not a ZIP/i);
  });

  it('accepts a single loose Connections.csv', async () => {
    const { outcome } = await importArchive(
      ws,
      Buffer.from(connectionsCsv(CONNECTIONS_V1.slice(0, 3)), 'utf8'),
      'Connections.csv'
    );
    expect(outcome.status).toBe('completed');
    expect(outcome.stats.peopleCreated).toBe(3);
  });

  it('imports an archive with no Profile.csv', async () => {
    const ws2 = await createTestWorkspace('noprofile');
    try {
      const { outcome } = await importArchive(ws2, buildArchive({ includeProfile: false }));
      expect(outcome.status).toBe('completed');
      const [{ count }] = await sql()<{ count: number }[]>`
        SELECT count(*)::int AS count FROM people WHERE workspace_id = ${ws2.workspaceId} AND is_self
      `;
      expect(count).toBe(0);
    } finally {
      await ws2.cleanup();
    }
  });
});

describeDb('workspace isolation', () => {
  it('keeps two workspaces importing the same archive completely separate', async () => {
    const a = await createTestWorkspace('iso-a');
    const b = await createTestWorkspace('iso-b');
    try {
      await importArchive(a, buildArchive());
      await importArchive(b, buildArchive());

      const rows = await sql()<{ workspace_id: string; count: number }[]>`
        SELECT workspace_id, count(*)::int AS count FROM people
        WHERE workspace_id IN (${a.workspaceId}, ${b.workspaceId})
        GROUP BY workspace_id
      `;
      expect(rows).toHaveLength(2);
      expect(rows[0].count).toBe(rows[1].count);

      // The same LinkedIn profile exists independently in both workspaces.
      const ids = await sql()<{ id: string }[]>`
        SELECT id FROM people WHERE dedupe_key = 'url:janesmith'
          AND workspace_id IN (${a.workspaceId}, ${b.workspaceId})
      `;
      expect(new Set(ids.map((i) => i.id)).size).toBe(2);
    } finally {
      await a.cleanup();
      await b.cleanup();
    }
  });
});

describeDb('performance', () => {
  it('imports 2,000 connections in a reasonable time', async () => {
    const ws = await createTestWorkspace('perf');
    try {
      const started = Date.now();
      const { outcome } = await importArchive(
        ws,
        buildArchive({ connections: largeConnections(2000), includeMessages: false })
      );
      const elapsed = Date.now() - started;
      expect(outcome.status).toBe('completed');
      const [{ count }] = await sql()<{ count: number }[]>`
        SELECT count(*)::int AS count FROM people WHERE workspace_id = ${ws.workspaceId} AND NOT is_self
      `;
      // 2,000 connections plus the four people who appear only in the
      // endorsement, recommendation and invitation datasets.
      expect(count).toBe(2004);
      expect(elapsed).toBeLessThan(30_000);
    } finally {
      await ws.cleanup();
    }
  }, 60_000);
});

async function counts(workspaceId: string) {
  const [row] = await sql()<Record<string, number>[]>`
    SELECT
      (SELECT count(*)::int FROM people WHERE workspace_id = ${workspaceId})            AS people,
      (SELECT count(*)::int FROM connections WHERE workspace_id = ${workspaceId})       AS connections,
      (SELECT count(*)::int FROM companies WHERE workspace_id = ${workspaceId})         AS companies,
      (SELECT count(*)::int FROM person_employment WHERE workspace_id = ${workspaceId}) AS employment,
      (SELECT count(*)::int FROM messages WHERE workspace_id = ${workspaceId})          AS messages,
      (SELECT count(*)::int FROM skills WHERE workspace_id = ${workspaceId})            AS skills,
      (SELECT count(*)::int FROM education WHERE workspace_id = ${workspaceId})         AS education,
      (SELECT count(*)::int FROM activities WHERE workspace_id = ${workspaceId})        AS activities,
      (SELECT count(*)::int FROM jobs WHERE workspace_id = ${workspaceId})              AS jobs
  `;
  return row;
}
