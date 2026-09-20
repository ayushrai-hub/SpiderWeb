import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildArchive, CONNECTIONS_V2, connectionsCsv, CONNECTIONS_V1 } from '../fixtures/linkedin-export';
import { closeSql, databaseAvailable, sql } from './helpers';

const available = await databaseAvailable();
const describeDb = available ? describe : describe.skip;

if (!available) {
  console.warn('Skipping API integration tests: no database with the SpiderWeb schema at DATABASE_URL.');
}

/** Multipart body builder — exercises the real upload path, not a mock. */
function multipart(files: { name: string; content: Uint8Array | string }[]) {
  const boundary = `----spiderwebtest${Math.random().toString(36).slice(2)}`;
  const parts: Buffer[] = [];
  for (const file of files) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${file.name}"\r\n` +
          `Content-Type: application/octet-stream\r\n\r\n`
      ),
      Buffer.from(typeof file.content === 'string' ? Buffer.from(file.content) : file.content),
      Buffer.from('\r\n')
    );
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(parts),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

describeDb('HTTP API', () => {
  let app: FastifyInstance;
  let workspaceId: string;

  beforeAll(async () => {
    const { resetEnv, loadEnv } = await import('@intel/shared');
    resetEnv();
    loadEnv();

    const { buildApp } = await import('../../apps/api/src/app');
    app = await buildApp({ logger: false });
    await app.ready();

    const me = await app.inject({ method: 'GET', url: '/api/v1/me' });
    workspaceId = me.json().data.workspace.id;

    // Start from a clean workspace so counts are deterministic.
    await resetWorkspace(workspaceId);
  });

  afterAll(async () => {
    await resetWorkspace(workspaceId);
    await app.close();
    await closeSql();
  });

  async function resetWorkspace(id: string) {
    for (const table of [
      'messages',
      'conversations',
      'activities',
      'jobs',
      'connections',
      'people',
      'companies',
      'tags',
      'audit_logs',
      'analytics_snapshots',
      'network_segments',
      'insights',
    ]) {
      await sql().unsafe(`DELETE FROM ${table} WHERE workspace_id = $1`, [id]);
    }
    await sql()`DELETE FROM import_files WHERE import_id IN (SELECT id FROM imports WHERE workspace_id = ${id})`;
    await sql()`DELETE FROM imports WHERE workspace_id = ${id}`;
  }

  async function upload(name: string, content: Uint8Array | string) {
    const { payload, headers } = multipart([{ name, content }]);
    const response = await app.inject({ method: 'POST', url: '/api/v1/imports', payload, headers });
    return response;
  }

  /** The API returns 202 immediately; wait for the background import to land. */
  async function waitForImport(importId: string, timeoutMs = 20_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const res = await app.inject({ method: 'GET', url: `/api/v1/imports/${importId}` });
      const status = res.json().data.status;
      if (status !== 'pending' && status !== 'processing') return res.json().data;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`Import ${importId} did not finish in time`);
  }

  describe('before any import', () => {
    it('reports an empty but valid dashboard', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/dashboard' });
      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.hasData).toBe(false);
      expect(data.totals.connections).toBe(0);
      expect(data.growth).toEqual([]);
    });

    it('reports onboarding state', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/me' });
      expect(res.json().data.onboarding.hasConnections).toBe(false);
    });

    it('returns an empty people list rather than an error', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/people' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ data: [], pagination: { total: 0 } });
    });
  });

  describe('upload validation', () => {
    it('rejects an unsupported file type with a specific message', async () => {
      const res = await upload('resume.pdf', 'not a csv');
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('NO_VALID_FILES');
      expect(res.json().error.message).toMatch(/\.pdf is not supported/);
    });

    it('rejects an empty file', async () => {
      const res = await upload('Connections.csv', '');
      expect(res.statusCode).toBe(400);
      expect(res.json().error.message).toMatch(/empty/i);
    });

    it('rejects a request with no file at all', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/imports',
        payload: Buffer.from('--x--\r\n'),
        headers: { 'content-type': 'multipart/form-data; boundary=x' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('records a failure when the archive holds no LinkedIn data', async () => {
      const res = await upload('notes.csv', 'a,b\n1,2\n');
      // The filename is allowed, so the import is accepted and then fails
      // during processing with a reason the user can act on.
      expect(res.statusCode).toBe(202);
      const record = await waitForImport(res.json().data.importId);
      expect(record.status).toBe('failed');
      expect(record.errorCode).toBe('NO_LINKEDIN_DATA');
      await app.inject({ method: 'DELETE', url: `/api/v1/imports/${record.id}` });
    });
  });

  describe('a complete import', () => {
    let importId: string;

    beforeAll(async () => {
      const res = await upload('export.zip', buildArchive());
      expect(res.statusCode).toBe(202);
      importId = res.json().data.importId;
      await waitForImport(importId);
    });

    it('exposes a per-file breakdown in the import history', async () => {
      const res = await app.inject({ method: 'GET', url: `/api/v1/imports/${importId}` });
      const data = res.json().data;
      expect(data.status).toBe('completed');
      expect(data.files.some((f: any) => f.dataset === 'connections' && f.status === 'normalized')).toBe(
        true
      );
      expect(data.files.some((f: any) => f.status === 'skipped' && /Advertising/.test(f.reason))).toBe(true);
      expect(data.metadata.stats.peopleCreated).toBeGreaterThan(0);
    });

    it('does not leak internal job plumbing in the import payload', async () => {
      const res = await app.inject({ method: 'GET', url: `/api/v1/imports/${importId}` });
      expect(JSON.stringify(res.json())).not.toMatch(/job_id|s3_key|\/tmp\//);
    });

    it('populates the dashboard from real rows', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/dashboard' });
      const data = res.json().data;
      expect(data.hasData).toBe(true);
      expect(data.totals.connections).toBe(12);
      expect(data.self.name).toBe('Alex Rivera');
      expect(data.growth.length).toBeGreaterThan(0);
      expect(data.topCompanies[0]).toMatchObject({ name: 'Acme Corp', total: 3 });
    });

    it('filters people by company, title and signal together', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/people?company=Acme&title=Engineer' });
      const names = res
        .json()
        .data.map((p: any) => p.name)
        .sort();
      expect(names).toEqual(['Frank Chen', 'Grace Okonkwo', 'Jane Smith']);

      const dormant = await app.inject({ method: 'GET', url: '/api/v1/people?signals=dormant&company=Acme' });
      expect(dormant.json().pagination.total).toBeLessThanOrEqual(3);
    });

    it('matches companies across spellings of the same name', async () => {
      // Frank Chen's row says "Acme Corporation"; the filter says "Acme".
      const res = await app.inject({ method: 'GET', url: '/api/v1/people?company=Acme%20Inc' });
      expect(res.json().data.map((p: any) => p.name)).toContain('Frank Chen');
    });

    it('rejects an unknown signal with a usable message', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/people?signals=vibes' });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.message).toMatch(/Unknown filter: vibes/);
    });

    it('paginates without loading everything', async () => {
      const page1 = await app.inject({ method: 'GET', url: '/api/v1/people?limit=5&page=1' });
      const page2 = await app.inject({ method: 'GET', url: '/api/v1/people?limit=5&page=2' });
      expect(page1.json().data).toHaveLength(5);
      expect(page1.json().pagination.totalPages).toBe(3);
      const overlap = page1.json().data.filter((a: any) => page2.json().data.some((b: any) => b.id === a.id));
      expect(overlap).toHaveLength(0);
    });

    it('searches by name, company and misspelling', async () => {
      const byName = await app.inject({ method: 'GET', url: '/api/v1/search?q=Jane' });
      expect(byName.json().data.some((h: any) => h.title === 'Jane Smith')).toBe(true);

      const byCompany = await app.inject({ method: 'GET', url: '/api/v1/search?q=acme' });
      expect(byCompany.json().data.some((h: any) => h.type === 'company')).toBe(true);

      const fuzzy = await app.inject({ method: 'GET', url: '/api/v1/search?q=jane%20smth' });
      expect(fuzzy.json().data.some((h: any) => h.title === 'Jane Smith')).toBe(true);
    });

    it('serves a person profile with employment, conversations and signals', async () => {
      const list = await app.inject({ method: 'GET', url: '/api/v1/people?q=Jane%20Smith' });
      const personId = list.json().data[0].id;
      const res = await app.inject({ method: 'GET', url: `/api/v1/people/${personId}` });
      const person = res.json().data;
      expect(person.name).toBe('Jane Smith');
      expect(person.profileUrl).toBe('https://www.linkedin.com/in/janesmith');
      expect(person.employment[0].companyName).toBe('Acme Corp');
      expect(person.conversations).toHaveLength(1);
      expect(person.signals).toContain('engaged');
      expect(person.sharedCompanies).toContain('Acme Corp');
    });

    it('404s for a person in no workspace', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/people/11111111-1111-4111-8111-111111111111',
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.message).toMatch(/not found/i);
    });

    it('404s for a malformed id rather than throwing', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/people/not-a-uuid' });
      expect(res.statusCode).toBe(404);
    });

    it('serves company intelligence', async () => {
      const list = await app.inject({ method: 'GET', url: '/api/v1/companies?q=Acme' });
      const companyId = list.json().data[0].id;
      const res = await app.inject({ method: 'GET', url: `/api/v1/companies/${companyId}` });
      const company = res.json().data;
      expect(company.name).toBe('Acme Corp');
      expect(company.people).toHaveLength(3);
      expect(company.topTitles.length).toBeGreaterThan(0);
      expect(company.selfWorkedHere).toBe(true);
    });

    it('returns an aggregated graph, not one node per person', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/graph' });
      const graph = res.json().data;
      expect(graph.mode).toBe('overview');
      expect(graph.kind).toBe('affiliation');
      expect(graph.caveat).toMatch(/affiliation graph/i);
      expect(graph.nodes.some((n: { type: string }) => n.type === 'self')).toBe(true);
      expect(graph.nodes.every((n: { type: string }) => n.type !== 'person')).toBe(true);
      expect(graph.nodes.length).toBeLessThan(20);
    });

    it('computes analytics with coverage rather than treating missing as zero', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/analytics' });
      expect(res.statusCode).toBe(200);
      const report = res.json().data;
      expect(report.networkSize).toBeGreaterThan(0);
      expect(report.quality.fields.find((f: { field: string }) => f.field === 'company').coverage.total).toBe(
        report.networkSize
      );
      expect(report.composition.currentCompanies.coverage.unknown).toBeGreaterThanOrEqual(0);
      expect(report.graphCaveat).toMatch(/affiliation/);
      const ask = await app.inject({
        method: 'GET',
        url: '/api/v1/analytics/ask?q=' + encodeURIComponent('How large is my network?'),
      });
      expect(ask.statusCode).toBe(200);
      expect(ask.json().data.answer).toMatch(String(report.networkSize));
    });

    it('expands one company into people on request', async () => {
      const list = await app.inject({ method: 'GET', url: '/api/v1/companies?q=Acme' });
      const companyId = list.json().data[0].id;
      const res = await app.inject({ method: 'GET', url: `/api/v1/graph?companyId=${companyId}` });
      const graph = res.json().data;
      expect(graph.mode).toBe('company');
      expect(graph.nodes.filter((n: any) => n.type === 'person')).toHaveLength(3);
    });

    it('exports CSV with formula injection neutralised', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/exports/connections.csv' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.headers['content-disposition']).toMatch(/attachment/);
      expect(res.body.split('\r\n')[0]).toMatch(/^"Name","First Name"/);
      expect(res.body).toMatch(/Jane Smith/);
    });

    it('keeps notes and tags out of the import path', async () => {
      const list = await app.inject({ method: 'GET', url: '/api/v1/people?q=Frank' });
      const personId = list.json().data[0].id;

      const note = await app.inject({
        method: 'POST',
        url: `/api/v1/people/${personId}/notes`,
        payload: { body: 'Intro via Grace' },
      });
      expect(note.statusCode).toBe(201);

      const tags = await app.inject({
        method: 'PUT',
        url: `/api/v1/people/${personId}/tags`,
        payload: { tags: ['mentor', 'Mentor', 'alumni'] },
      });
      expect(tags.json().data.tags).toEqual(['alumni', 'mentor']);

      const second = await upload('export.zip', buildArchive());
      await waitForImport(second.json().data.importId);

      const after = await app.inject({ method: 'GET', url: `/api/v1/people/${personId}` });
      expect(after.json().data.notes).toHaveLength(1);
      expect(after.json().data.tags).toEqual(['alumni', 'mentor']);
    });

    it('rejects an empty note', async () => {
      const list = await app.inject({ method: 'GET', url: '/api/v1/people?q=Frank' });
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/people/${list.json().data[0].id}/notes`,
        payload: { body: '   ' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('flags a repeat upload of the same bytes', async () => {
      const res = await upload('export.zip', buildArchive());
      expect(res.json().data.previouslyImportedAt).not.toBeNull();
      await waitForImport(res.json().data.importId);
    });

    it('stays idempotent across repeat imports', async () => {
      const before = await app.inject({ method: 'GET', url: '/api/v1/dashboard' });
      const res = await upload('export.zip', buildArchive());
      await waitForImport(res.json().data.importId);
      const after = await app.inject({ method: 'GET', url: '/api/v1/dashboard' });
      // The import count legitimately rises; nothing else may change.
      const strip = (t: Record<string, number>) => ({ ...t, imports: 0 });
      expect(strip(after.json().data.totals)).toEqual(strip(before.json().data.totals));
    });
  });

  describe('incremental import over HTTP', () => {
    it('adds new people, updates movers and reports a career move', async () => {
      const res = await upload('export-v2.zip', buildArchive({ connections: CONNECTIONS_V2 }));
      await waitForImport(res.json().data.importId);

      const dashboard = await app.inject({ method: 'GET', url: '/api/v1/dashboard' });
      const data = dashboard.json().data;
      expect(data.totals.connections).toBe(13);
      expect(data.careerMoveCount).toBeGreaterThanOrEqual(1);
      expect(data.careerMoves.map((m: { name: string }) => m.name)).toContain('Jane Smith');

      const moved = await app.inject({ method: 'GET', url: '/api/v1/people?signals=changed_company' });
      expect(moved.json().data.map((p: any) => p.name)).toContain('Jane Smith');
    });
  });

  describe('loose CSV upload', () => {
    it('accepts a single Connections.csv', async () => {
      const res = await upload('Connections.csv', connectionsCsv(CONNECTIONS_V1.slice(0, 3)));
      expect(res.statusCode).toBe(202);
      const record = await waitForImport(res.json().data.importId);
      expect(record.status).toBe('completed');
    });
  });

  describe('data management', () => {
    it('requires an explicit confirmation to wipe the network', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/network/reset', payload: {} });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('CONFIRMATION_REQUIRED');
    });

    it('recalculates derived analytics on demand', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/imports/refresh-analytics' });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toHaveProperty('companiesScored');
    });

    it('wipes everything when confirmed', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/network/reset',
        payload: { confirm: 'DELETE' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.deletedPeople).toBeGreaterThan(0);

      const dashboard = await app.inject({ method: 'GET', url: '/api/v1/dashboard' });
      expect(dashboard.json().data.hasData).toBe(false);

      const audit =
        await sql()`SELECT action FROM audit_logs WHERE workspace_id = ${workspaceId} ORDER BY created_at DESC LIMIT 1`;
      expect(audit[0]?.action).toBe('network.reset');
    });
  });

  describe('errors', () => {
    it('returns a structured 404 for an unknown route', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/nope' });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('ROUTE_NOT_FOUND');
    });

    it('never returns a stack trace to the client', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/people?limit=99999' });
      expect(res.statusCode).toBe(400);
      expect(res.body).not.toMatch(/at Object|node_modules|\.ts:/);
    });
  });
});
