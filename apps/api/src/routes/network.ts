import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '@intel/shared';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { writeRateLimit } from '../middleware/rate-limit.js';
import { badRequest, notFound } from '../middleware/error-handler.js';
import { getFacets, getPerson, getSelfContext, listPeople } from '../services/network.js';
import { getPersonContext } from '../services/analytics.js';
import { isSignalKey, SIGNALS, type SignalKey } from '../services/signals.js';
import { recordAudit } from '../services/audit.js';

const listSchema = z.object({
  q: z.string().trim().max(200).optional(),
  company: z.string().trim().max(200).optional(),
  pastCompany: z.string().trim().max(200).optional(),
  title: z.string().trim().max(200).optional(),
  location: z.string().trim().max(200).optional(),
  industry: z.string().trim().max(200).optional(),
  school: z.string().trim().max(200).optional(),
  tag: z.string().trim().max(60).optional(),
  connectedAfter: z
    .string()
    .datetime()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .optional(),
  connectedBefore: z
    .string()
    .datetime()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .optional(),
  signals: z.string().optional(),
  sort: z.enum(['name', 'connected_desc', 'connected_asc', 'company', 'interaction', 'relevance']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const noteSchema = z.object({ body: z.string().trim().min(1).max(5000) });
const tagsSchema = z.object({ tags: z.array(z.string().trim().min(1).max(60)).max(25) });

export async function networkRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/people', async (request) => {
    const parsed = listSchema.parse(request.query);
    const signals = (parsed.signals ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const invalid = signals.filter((s) => !isSignalKey(s));
    if (invalid.length) {
      throw badRequest(
        `Unknown filter: ${invalid.join(', ')}. Valid filters: ${Object.keys(SIGNALS).join(', ')}.`
      );
    }

    const workspaceId = request.user.workspaceId;
    const self = await getSelfContext(workspaceId);
    const { rows, total } = await listPeople(
      workspaceId,
      { ...parsed, signals: signals as SignalKey[] },
      self
    );

    return {
      data: rows,
      pagination: {
        page: parsed.page,
        limit: parsed.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / parsed.limit)),
      },
    };
  });

  app.get('/api/v1/people/facets', async (request) => {
    const workspaceId = request.user.workspaceId;
    const self = await getSelfContext(workspaceId);
    return { data: await getFacets(workspaceId, self) };
  });

  app.get('/api/v1/people/:personId', async (request) => {
    const { personId } = request.params as { personId: string };
    if (!isUuid(personId)) throw notFound('That person');
    const workspaceId = request.user.workspaceId;
    const self = await getSelfContext(workspaceId);
    const person = await getPerson(workspaceId, personId, self);
    if (!person) throw notFound('That person');
    return { data: person };
  });

  app.get('/api/v1/people/:personId/context', async (request) => {
    const { personId } = request.params as { personId: string };
    if (!isUuid(personId)) throw notFound('That person');
    const ctx = await getPersonContext(request.user.workspaceId, personId);
    if (!ctx) throw notFound('That person');
    return { data: ctx };
  });

  // --- Notes -------------------------------------------------------------

  app.post('/api/v1/people/:personId/notes', { preHandler: [writeRateLimit] }, async (request, reply) => {
    const { personId } = request.params as { personId: string };
    const { body } = noteSchema.parse(request.body);
    const workspaceId = request.user.workspaceId;

    await assertPersonExists(workspaceId, personId);
    const [note] = await query<Record<string, unknown>>(
      `INSERT INTO person_notes (workspace_id, person_id, author_id, body)
       VALUES ($1, $2, $3, $4) RETURNING id, body, created_at, updated_at`,
      [workspaceId, personId, request.user.id, body]
    );
    return reply.status(201).send({ data: toNote(note) });
  });

  app.patch('/api/v1/notes/:noteId', { preHandler: [writeRateLimit] }, async (request) => {
    const { noteId } = request.params as { noteId: string };
    const { body } = noteSchema.parse(request.body);
    const rows = await query<Record<string, unknown>>(
      `UPDATE person_notes SET body = $1, updated_at = now()
       WHERE id = $2 AND workspace_id = $3
       RETURNING id, body, created_at, updated_at`,
      [body, noteId, request.user.workspaceId]
    );
    if (rows.length === 0) throw notFound('That note');
    return { data: toNote(rows[0]) };
  });

  app.delete('/api/v1/notes/:noteId', { preHandler: [writeRateLimit] }, async (request, reply) => {
    const { noteId } = request.params as { noteId: string };
    const rows = await query<{ id: string }>(
      `DELETE FROM person_notes WHERE id = $1 AND workspace_id = $2 RETURNING id`,
      [noteId, request.user.workspaceId]
    );
    if (rows.length === 0) throw notFound('That note');
    return reply.status(204).send();
  });

  // --- Tags --------------------------------------------------------------

  app.get('/api/v1/tags', async (request) => {
    const rows = await query<{ id: string; name: string; count: number }>(
      `SELECT t.id, t.name, count(pt.person_id)::int AS count
       FROM tags t LEFT JOIN person_tags pt ON pt.tag_id = t.id
       WHERE t.workspace_id = $1 GROUP BY t.id, t.name ORDER BY t.name`,
      [request.user.workspaceId]
    );
    return { data: rows };
  });

  /** Replace a person's tags. Creates any tag that does not exist yet. */
  app.put('/api/v1/people/:personId/tags', { preHandler: [writeRateLimit] }, async (request) => {
    const { personId } = request.params as { personId: string };
    const { tags } = tagsSchema.parse(request.body);
    const workspaceId = request.user.workspaceId;
    await assertPersonExists(workspaceId, personId);

    // Tags are case-insensitive; keep the first spelling the user typed.
    const seen = new Set<string>();
    const unique = tags.filter((t) => {
      const key = t.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (unique.length > 0) {
      await query(
        `INSERT INTO tags (workspace_id, name)
         SELECT $1, unnest($2::text[])
         ON CONFLICT (workspace_id, lower(name)) DO NOTHING`,
        [workspaceId, unique]
      );
    }
    await query(`DELETE FROM person_tags WHERE person_id = $1 AND workspace_id = $2`, [
      personId,
      workspaceId,
    ]);
    if (unique.length > 0) {
      await query(
        `INSERT INTO person_tags (person_id, tag_id, workspace_id)
         SELECT $1, t.id, $2 FROM tags t
         WHERE t.workspace_id = $2 AND lower(t.name) = ANY($3::text[])
         ON CONFLICT DO NOTHING`,
        [personId, workspaceId, unique.map((t) => t.toLowerCase())]
      );
    }
    // Tags nobody uses are noise in the filter list.
    await query(
      `DELETE FROM tags t WHERE t.workspace_id = $1
         AND NOT EXISTS (SELECT 1 FROM person_tags pt WHERE pt.tag_id = t.id)`,
      [workspaceId]
    );

    const rows = await query<{ name: string }>(
      `SELECT t.name FROM person_tags pt JOIN tags t ON t.id = pt.tag_id
       WHERE pt.person_id = $1 ORDER BY t.name`,
      [personId]
    );
    return { data: { tags: rows.map((r) => r.name) } };
  });

  // --- Data management ---------------------------------------------------

  /**
   * Delete every imported record in the workspace. Requires an explicit
   * confirmation string so it cannot be triggered by a stray request.
   */
  app.post(
    '/api/v1/network/reset',
    { preHandler: [requireRole('owner'), writeRateLimit] },
    async (request) => {
      const body = z.object({ confirm: z.literal('DELETE') }).safeParse(request.body);
      if (!body.success) {
        throw badRequest(
          'Send { "confirm": "DELETE" } to erase every imported record.',
          'CONFIRMATION_REQUIRED'
        );
      }
      const workspaceId = request.user.workspaceId;

      const [before] = await query<{ people: number }>(
        `SELECT count(*)::int AS people FROM people WHERE workspace_id = $1`,
        [workspaceId]
      );

      // people/companies cascade to employment, education, skills, notes, tags.
      for (const table of [
        'messages',
        'conversations',
        'activities',
        'job_applications',
        'saved_jobs',
        'jobs',
        'connections',
        'people',
        'companies',
        'import_files',
        'imports',
        'analytics_snapshots',
        'network_segments',
        'insights',
      ]) {
        if (table === 'import_files') {
          await query(
            `DELETE FROM import_files WHERE import_id IN (SELECT id FROM imports WHERE workspace_id = $1)`,
            [workspaceId]
          );
        } else {
          await query(`DELETE FROM ${table} WHERE workspace_id = $1`, [workspaceId]);
        }
      }

      await recordAudit({
        workspaceId,
        userId: request.user.id,
        action: 'network.reset',
        resource: 'workspace',
        resourceId: workspaceId,
        metadata: { deletedPeople: before?.people ?? 0 },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? null,
      });

      return { data: { deletedPeople: before?.people ?? 0 } };
    }
  );
}

async function assertPersonExists(workspaceId: string, personId: string): Promise<void> {
  if (!isUuid(personId)) throw notFound('That person');
  const rows = await query<{ id: string }>(`SELECT id FROM people WHERE id = $1 AND workspace_id = $2`, [
    personId,
    workspaceId,
  ]);
  if (rows.length === 0) throw notFound('That person');
}

function toNote(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    body: row.body as string,
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(value: string): boolean {
  return UUID.test(value);
}
