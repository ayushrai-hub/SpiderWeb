import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { query } from '@intel/shared';
import { authMiddleware } from '../middleware/auth.js';
import { getDashboard } from '../services/dashboard.js';
import { getAnalyticsReport } from '../services/analytics.js';
import type { Row } from '../services/row.js';
import { recordAudit } from '../services/audit.js';

/** RFC 4180 quoting, plus a guard against spreadsheet formula injection. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function csvDocument(headers: string[], rows: unknown[][]): string {
  return [headers.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\r\n') + '\r\n';
}

export async function exportRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/exports/connections.csv', async (request, reply) => {
    const rows = await query<Row>(
      `SELECT p.canonical_name, p.first_name, p.last_name, p.current_title, p.current_company,
              p.location, p.industry, p.email, p.profile_url, p.connected_at, p.interaction_count,
              COALESCE((SELECT string_agg(t.name, '; ' ORDER BY t.name)
                        FROM person_tags pt JOIN tags t ON t.id = pt.tag_id
                        WHERE pt.person_id = p.id), '') AS tags
       FROM people p WHERE p.workspace_id = $1 AND NOT p.is_self
       ORDER BY p.canonical_name`,
      [request.user.workspaceId]
    );
    await audit(request, 'connections.csv', rows.length);
    return send(
      reply,
      'spiderweb-connections.csv',
      csvDocument(
        [
          'Name',
          'First Name',
          'Last Name',
          'Title',
          'Company',
          'Location',
          'Industry',
          'Email',
          'Profile URL',
          'Connected On',
          'Interactions',
          'Tags',
        ],
        rows.map((r) => [
          r.canonical_name,
          r.first_name,
          r.last_name,
          r.current_title,
          r.current_company,
          r.location,
          r.industry,
          r.email,
          r.profile_url,
          r.connected_at ? new Date(r.connected_at).toISOString().slice(0, 10) : '',
          r.interaction_count,
          r.tags,
        ])
      )
    );
  });

  app.get('/api/v1/exports/companies.csv', async (request, reply) => {
    const rows = await query<Row>(
      `SELECT canonical_name, industry, location, connection_count, current_count, former_count, linkedin_url
       FROM companies WHERE workspace_id = $1 ORDER BY connection_count DESC, canonical_name`,
      [request.user.workspaceId]
    );
    await audit(request, 'companies.csv', rows.length);
    return send(
      reply,
      'spiderweb-companies.csv',
      csvDocument(
        ['Company', 'Industry', 'Location', 'Connections', 'Current', 'Former', 'LinkedIn URL'],
        rows.map((r) => [
          r.canonical_name,
          r.industry,
          r.location,
          r.connection_count,
          r.current_count,
          r.former_count,
          r.linkedin_url,
        ])
      )
    );
  });

  app.get('/api/v1/exports/network.json', async (request, reply) => {
    const dashboard = await getDashboard(request.user.workspaceId);
    await audit(request, 'network.json', dashboard.totals.connections);
    reply.header('Content-Type', 'application/json; charset=utf-8');
    reply.header('Content-Disposition', 'attachment; filename="spiderweb-network.json"');
    return reply.send(JSON.stringify({ generatedAt: new Date().toISOString(), ...dashboard }, null, 2));
  });

  app.get('/api/v1/exports/analytics.json', async (request, reply) => {
    const report = await getAnalyticsReport(request.user.workspaceId);
    await audit(request, 'analytics.json', report.networkSize);
    reply.header('Content-Type', 'application/json; charset=utf-8');
    reply.header('Content-Disposition', 'attachment; filename="spiderweb-analytics.json"');
    return reply.send(JSON.stringify(report, null, 2));
  });
}

function send(reply: FastifyReply, filename: string, body: string) {
  reply.header('Content-Type', 'text/csv; charset=utf-8');
  reply.header('Content-Disposition', `attachment; filename="${filename}"`);
  return reply.send(body);
}

async function audit(request: FastifyRequest, resource: string, rows: number) {
  await recordAudit({
    workspaceId: request.user.workspaceId,
    userId: request.user.id,
    action: 'data.export',
    resource,
    metadata: { rows },
    ipAddress: request.ip,
    userAgent: (request.headers['user-agent'] as string) ?? null,
  });
}
