import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '@intel/shared';
import { authMiddleware } from '../middleware/auth.js';
import { notFound } from '../middleware/error-handler.js';
import type { Row } from '../services/row.js';

const paged = z.object({
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export async function communicationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/conversations', async (request) => {
    const { q, page, limit } = paged.parse(request.query);
    const workspaceId = request.user.workspaceId;
    const params: unknown[] = [workspaceId];
    let where = 'c.workspace_id = $1';
    if (q) {
      params.push(`%${q}%`);
      where += ` AND (c.title ILIKE $${params.length} OR p.canonical_name ILIKE $${params.length})`;
    }

    const [countRow] = await query<{ count: number }>(
      `SELECT count(*)::int AS count FROM conversations c
       LEFT JOIN people p ON p.id = c.person_id WHERE ${where}`,
      params
    );
    params.push(limit, (page - 1) * limit);
    const rows = await query<Row>(
      `SELECT c.id, c.title, c.message_count, c.last_message_at, c.started_at,
              p.id AS person_id, p.canonical_name, p.current_company, p.profile_url
       FROM conversations c
       LEFT JOIN people p ON p.id = c.person_id
       WHERE ${where}
       ORDER BY c.last_message_at DESC NULLS LAST
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return {
      data: rows.map((r) => ({
        id: r.id,
        title: r.canonical_name ?? r.title ?? 'Conversation',
        messageCount: r.message_count ?? 0,
        startedAt: r.started_at ? new Date(r.started_at).toISOString() : null,
        lastMessageAt: r.last_message_at ? new Date(r.last_message_at).toISOString() : null,
        person: r.person_id
          ? {
              id: r.person_id,
              name: r.canonical_name,
              currentCompany: r.current_company,
              profileUrl: r.profile_url,
            }
          : null,
      })),
      pagination: {
        page,
        limit,
        total: countRow?.count ?? 0,
        totalPages: Math.max(1, Math.ceil((countRow?.count ?? 0) / limit)),
      },
    };
  });

  app.get('/api/v1/conversations/:conversationId', async (request) => {
    const { conversationId } = request.params as { conversationId: string };
    const workspaceId = request.user.workspaceId;

    const [conversation] = await query<Row>(
      `SELECT c.id, c.title, c.message_count, c.started_at, c.last_message_at,
              p.id AS person_id, p.canonical_name, p.current_company, p.profile_url
       FROM conversations c LEFT JOIN people p ON p.id = c.person_id
       WHERE c.id = $1 AND c.workspace_id = $2`,
      [conversationId, workspaceId]
    );
    if (!conversation) throw notFound('That conversation');

    const messages = await query<Row>(
      `SELECT id, sender_name, recipient_name, subject, content, sent_at, direction
       FROM messages WHERE conversation_id = $1 AND workspace_id = $2
       ORDER BY sent_at ASC NULLS LAST LIMIT 500`,
      [conversationId, workspaceId]
    );

    return {
      data: {
        id: conversation.id,
        title: conversation.canonical_name ?? conversation.title ?? 'Conversation',
        messageCount: conversation.message_count ?? 0,
        startedAt: conversation.started_at ? new Date(conversation.started_at).toISOString() : null,
        lastMessageAt: conversation.last_message_at
          ? new Date(conversation.last_message_at).toISOString()
          : null,
        person: conversation.person_id
          ? {
              id: conversation.person_id,
              name: conversation.canonical_name,
              currentCompany: conversation.current_company,
              profileUrl: conversation.profile_url,
            }
          : null,
        messages: messages.map((m) => ({
          id: m.id,
          senderName: m.sender_name ?? null,
          recipientName: m.recipient_name ?? null,
          subject: m.subject ?? null,
          content: m.content ?? '',
          sentAt: m.sent_at ? new Date(m.sent_at).toISOString() : null,
          direction: m.direction,
        })),
      },
    };
  });

  app.get('/api/v1/jobs', async (request) => {
    const { page, limit } = paged.parse(request.query);
    const workspaceId = request.user.workspaceId;
    const [countRow] = await query<{ count: number }>(
      `SELECT count(*)::int AS count FROM jobs WHERE workspace_id = $1`,
      [workspaceId]
    );
    const rows = await query<Row>(
      `SELECT j.id, j.title, j.company_name, j.location, j.url, j.applied_at, j.saved_at, j.company_id,
              c.connection_count
       FROM jobs j LEFT JOIN companies c ON c.id = j.company_id
       WHERE j.workspace_id = $1
       ORDER BY COALESCE(j.applied_at, j.saved_at) DESC NULLS LAST, j.title
       LIMIT $2 OFFSET $3`,
      [workspaceId, limit, (page - 1) * limit]
    );

    return {
      data: rows.map((j) => ({
        id: j.id,
        title: j.title,
        companyName: j.company_name ?? null,
        companyId: j.company_id ?? null,
        /** How many of your connections are at this company — the reason a job list belongs in a network tool. */
        connectionsAtCompany: j.connection_count ?? 0,
        location: j.location ?? null,
        url: j.url ?? null,
        appliedAt: j.applied_at ? new Date(j.applied_at).toISOString() : null,
        savedAt: j.saved_at ? new Date(j.saved_at).toISOString() : null,
      })),
      pagination: {
        page,
        limit,
        total: countRow?.count ?? 0,
        totalPages: Math.max(1, Math.ceil((countRow?.count ?? 0) / limit)),
      },
    };
  });
}
