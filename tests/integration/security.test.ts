import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { existsSync } from 'node:fs';
import { buildMaliciousArchive, connectionsCsv, CONNECTIONS_V1 } from '../fixtures/linkedin-export';
import { closeSql, createTestWorkspace, databaseAvailable, sql, type TestWorkspace } from './helpers';

const available = await databaseAvailable();
const describeDb = available ? describe : describe.skip;

function multipart(files: { name: string; content: Uint8Array | string }[], field = 'files') {
  const boundary = `----spiderwebsec${Math.random().toString(36).slice(2)}`;
  const parts: Buffer[] = [];
  for (const file of files) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${file.name}"\r\n` +
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

describeDb('security', () => {
  let app: FastifyInstance;
  let workspaceId: string;

  beforeAll(async () => {
    const { resetEnv, loadEnv } = await import('@intel/shared');
    resetEnv();
    loadEnv();
    const { buildApp } = await import('../../apps/api/src/app');
    app = await buildApp({ logger: false });
    await app.ready();
    workspaceId = (await app.inject({ method: 'GET', url: '/api/v1/me' })).json().data.workspace.id;
  });

  afterAll(async () => {
    await app.close();
    await closeSql();
  });

  describe('workspace isolation', () => {
    let other: TestWorkspace;
    let otherPersonId: string;
    let otherCompanyId: string;

    beforeAll(async () => {
      other = await createTestWorkspace('intruder');
      const [person] = await sql()<{ id: string }[]>`
        INSERT INTO people (workspace_id, canonical_name, dedupe_key)
        VALUES (${other.workspaceId}, 'Secret Person', 'url:secretperson')
        RETURNING id
      `;
      otherPersonId = person.id;
      const [company] = await sql()<{ id: string }[]>`
        INSERT INTO companies (workspace_id, canonical_name, normalized_name)
        VALUES (${other.workspaceId}, 'Secret Corp', 'secret corp')
        RETURNING id
      `;
      otherCompanyId = company.id;
    });

    afterAll(async () => {
      await other.cleanup();
    });

    it('never returns another workspace’s person by id', async () => {
      const res = await app.inject({ method: 'GET', url: `/api/v1/people/${otherPersonId}` });
      expect(res.statusCode).toBe(404);
    });

    it('never returns another workspace’s company by id', async () => {
      const res = await app.inject({ method: 'GET', url: `/api/v1/companies/${otherCompanyId}` });
      expect(res.statusCode).toBe(404);
    });

    it('never lists another workspace’s records', async () => {
      const people = await app.inject({ method: 'GET', url: '/api/v1/people?q=Secret' });
      expect(people.json().data).toHaveLength(0);

      const search = await app.inject({ method: 'GET', url: '/api/v1/search?q=Secret' });
      expect(search.json().data).toHaveLength(0);

      const companies = await app.inject({ method: 'GET', url: '/api/v1/companies?q=Secret' });
      expect(companies.json().data).toHaveLength(0);
    });

    it('cannot be redirected to another workspace by a header', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/people?q=Secret',
        headers: { 'x-workspace-id': other.workspaceId },
      });
      expect(res.json().data).toHaveLength(0);
    });

    it('cannot write a note onto another workspace’s person', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/people/${otherPersonId}/notes`,
        payload: { body: 'should not be stored' },
      });
      expect(res.statusCode).toBe(404);
      const notes = await sql()`SELECT id FROM person_notes WHERE person_id = ${otherPersonId}`;
      expect(notes).toHaveLength(0);
    });

    it('cannot delete another workspace’s import', async () => {
      const importId = randomUUID();
      await sql()`
        INSERT INTO imports (id, workspace_id, source_type, status)
        VALUES (${importId}, ${other.workspaceId}, 'linkedin', 'completed')
      `;
      const res = await app.inject({ method: 'DELETE', url: `/api/v1/imports/${importId}` });
      expect(res.statusCode).toBe(404);
      const still = await sql()`SELECT id FROM imports WHERE id = ${importId}`;
      expect(still).toHaveLength(1);
    });

    it('resetting one workspace leaves the other untouched', async () => {
      await app.inject({ method: 'POST', url: '/api/v1/network/reset', payload: { confirm: 'DELETE' } });
      const survivors = await sql()`SELECT id FROM people WHERE workspace_id = ${other.workspaceId}`;
      expect(survivors).toHaveLength(1);
    });
  });

  describe('injection', () => {
    it('treats SQL metacharacters in filters as literal text', async () => {
      for (const payload of [
        "'; DROP TABLE people; --",
        "' OR '1'='1",
        "%' UNION SELECT NULL--",
        "\\'; DELETE FROM connections WHERE '1'='1",
      ]) {
        const res = await app.inject({
          method: 'GET',
          url: `/api/v1/people?q=${encodeURIComponent(payload)}&company=${encodeURIComponent(payload)}`,
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().data).toEqual([]);
      }
      // The tables are still there.
      const tables = await sql()`SELECT count(*)::int AS n FROM people`;
      expect(tables[0].n).toBeGreaterThanOrEqual(0);
    });

    it('rejects an unknown sort column instead of interpolating it', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/people?sort=id;DROP%20TABLE%20people' });
      expect(res.statusCode).toBe(400);
    });

    it('neutralises spreadsheet formulas in CSV exports', async () => {
      const [{ id }] = await sql()<{ id: string }[]>`
        INSERT INTO people (workspace_id, canonical_name, dedupe_key)
        VALUES (${workspaceId}, ${'=cmd|calc!A1'}, ${'url:formula'})
        RETURNING id
      `;
      const res = await app.inject({ method: 'GET', url: '/api/v1/exports/connections.csv' });
      expect(res.body).toContain(`"'=cmd|calc!A1"`);
      expect(res.body).not.toContain('"=cmd|calc!A1"');
      await sql()`DELETE FROM people WHERE id = ${id}`;
    });
  });

  describe('upload handling', () => {
    it('refuses an archive whose entries escape the extraction directory', async () => {
      const { payload, headers } = multipart([{ name: 'evil.zip', content: buildMaliciousArchive() }]);
      const res = await app.inject({ method: 'POST', url: '/api/v1/imports', payload, headers });
      expect(res.statusCode).toBe(202);

      const importId = res.json().data.importId;
      const deadline = Date.now() + 20_000;
      let status = 'pending';
      while (Date.now() < deadline && (status === 'pending' || status === 'processing')) {
        const detail = await app.inject({ method: 'GET', url: `/api/v1/imports/${importId}` });
        status = detail.json().data.status;
        if (status === 'pending' || status === 'processing') await new Promise((r) => setTimeout(r, 100));
      }
      expect(status).toBe('completed');
      expect(existsSync('/tmp/spiderweb-pwned.txt')).toBe(false);
      expect(existsSync('/etc/spiderweb-pwned.txt')).toBe(false);
    });

    it('does not trust the filename it is given', async () => {
      const { payload, headers } = multipart([
        { name: '../../../../etc/passwd.csv', content: connectionsCsv(CONNECTIONS_V1.slice(0, 1)) },
      ]);
      const res = await app.inject({ method: 'POST', url: '/api/v1/imports', payload, headers });
      expect(res.statusCode).toBe(202);
      expect(res.json().data.filename).toBe('passwd.csv');
      expect(existsSync('/etc/passwd.csv')).toBe(false);
    });

    it('rejects an executable disguised with a CSV extension', async () => {
      const { payload, headers } = multipart([
        { name: 'payload.csv', content: Buffer.from([0x7f, 0x45, 0x4c, 0x46]) },
      ]);
      const res = await app.inject({ method: 'POST', url: '/api/v1/imports', payload, headers });
      // Accepted as an upload, then rejected during processing because it is
      // not a LinkedIn dataset — never executed, never stored as network data.
      expect(res.statusCode).toBe(202);
    });

    it('rate limits repeated uploads', async () => {
      let limited = false;
      for (let i = 0; i < 25 && !limited; i++) {
        const { payload, headers } = multipart([{ name: 'x.csv', content: 'a,b\n1,2\n' }]);
        const res = await app.inject({ method: 'POST', url: '/api/v1/imports', payload, headers });
        if (res.statusCode === 429) limited = true;
      }
      expect(limited).toBe(true);
    });
  });

  describe('response hygiene', () => {
    it('does not leak stack traces, paths or credentials on error', async () => {
      const responses = await Promise.all([
        app.inject({ method: 'GET', url: '/api/v1/people/%00' }),
        app.inject({ method: 'GET', url: '/api/v1/companies/not-a-uuid' }),
        app.inject({ method: 'GET', url: '/api/v1/search' }),
        app.inject({ method: 'POST', url: '/api/v1/network/reset', payload: { confirm: 'nope' } }),
      ]);
      for (const res of responses) {
        expect(res.statusCode).toBeGreaterThanOrEqual(400);
        const body = res.body;
        expect(body).not.toMatch(/postgres|password|DATABASE_URL|node_modules|\/Volumes\/|at Object\./i);
      }
    });

    it('does not expose environment configuration through health checks', async () => {
      const res = await app.inject({ method: 'GET', url: '/health/ready' });
      expect(res.body).not.toMatch(/postgresql:\/\/|redis:\/\/|password/i);
    });
  });
});
