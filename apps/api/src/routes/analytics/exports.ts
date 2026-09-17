import type { FastifyInstance } from 'fastify';
import { getSupabase } from '@intel/shared';
import { authMiddleware } from '../../middleware/auth.js';
import {
  getNetworkAnalytics,
  getCommunicationAnalytics,
} from '../../services/analytics.js';
import { getProfileData } from '../../services/profile.js';

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) lines.push(row.map(csvEscape).join(','));
  return lines.join('\n');
}

export async function exportRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // Full analytics report as JSON
  app.get('/api/v1/exports/analytics.json', async (request, reply) => {
    const workspaceId = request.user.workspaceId;
    const [network, communication, profile] = await Promise.all([
      getNetworkAnalytics(workspaceId),
      getCommunicationAnalytics(workspaceId),
      getProfileData(workspaceId),
    ]);

    reply.header('Content-Type', 'application/json; charset=utf-8');
    reply.header(
      'Content-Disposition',
      `attachment; filename="spiderweb-analytics-${new Date().toISOString().slice(0, 10)}.json"`
    );
    return reply.send({
      generatedAt: new Date().toISOString(),
      source: 'SpiderWeb',
      profile: {
        name: profile.identity.name,
        headline: profile.identity.headline,
        network: profile.network,
      },
      network,
      communication: {
        totalMessages: communication.totalMessages,
        sentMessages: communication.sentMessages,
        receivedMessages: communication.receivedMessages,
        conversations: communication.conversations,
      },
    });
  });

  // Connections CSV
  app.get('/api/v1/exports/connections.csv', async (request, reply) => {
    const workspaceId = request.user.workspaceId;
    const supabase = getSupabase();

    const { data } = await supabase
      .from('people')
      .select('canonical_name, headline, location, profile_url, created_at')
      .eq('workspace_id', workspaceId)
      .order('canonical_name')
      .limit(10000);

    const csv = toCsv(
      ['Name', 'Headline', 'Location', 'Profile URL', 'Imported'],
      (data || []).map((p: any) => [
        p.canonical_name,
        p.headline,
        p.location,
        p.profile_url,
        p.created_at ? p.created_at.slice(0, 10) : '',
      ])
    );

    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', 'attachment; filename="spiderweb-connections.csv"');
    return reply.send(csv);
  });

  // Companies CSV
  app.get('/api/v1/exports/companies.csv', async (request, reply) => {
    const workspaceId = request.user.workspaceId;
    const supabase = getSupabase();

    const { data } = await supabase
      .from('companies')
      .select('canonical_name, industry, location, linkedin_url')
      .eq('workspace_id', workspaceId)
      .order('canonical_name')
      .limit(10000);

    const csv = toCsv(
      ['Company', 'Industry', 'Location', 'LinkedIn URL'],
      (data || []).map((c: any) => [
        c.canonical_name,
        c.industry,
        c.location,
        c.linkedin_url,
      ])
    );

    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', 'attachment; filename="spiderweb-companies.csv"');
    return reply.send(csv);
  });
}
