import { getSupabase } from '@intel/shared';

export interface ProfileAnalytics {
  networkComposition: {
    industries: Array<{ name: string; count: number }>;
    companies: Array<{ name: string; count: number }>;
    locations: Array<{ name: string; count: number }>;
  };
  growth: Array<{ month: string; count: number }>;
  messageActivity: {
    byMonth: Array<{ month: string; inbound: number; outbound: number }>;
    total: number;
    sent: number;
    received: number;
  };
  topCompanies: Array<{ name: string; people: number }>;
  schools: Array<{ name: string; people: number }>;
  totals: {
    connections: number;
    companies: number;
    messages: number;
    schools: number;
  };
}

function monthOf(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'unknown';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function topN(map: Map<string, number>, n: number): Array<{ name: string; count: number }> {
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

export async function getProfileAnalytics(workspaceId: string): Promise<ProfileAnalytics> {
  const supabase = getSupabase();

  const [peopleRes, connectionsRes, companiesRes, messagesRes, educationRes] =
    await Promise.all([
      supabase.from('people').select('location, headline').eq('workspace_id', workspaceId),
      supabase.from('connections').select('connected_at').eq('workspace_id', workspaceId),
      supabase.from('companies').select('canonical_name, industry').eq('workspace_id', workspaceId),
      supabase.from('messages').select('direction, sent_at').eq('workspace_id', workspaceId),
      supabase.from('education').select('school_name'),
    ]);

  const people = peopleRes.data || [];
  const connections = connectionsRes.data || [];
  const companies = companiesRes.data || [];
  const messages = messagesRes.data || [];
  const education = educationRes.data || [];

  // Composition from real rows only
  const industries = new Map<string, number>();
  const locations = new Map<string, number>();
  for (const p of people) {
    if (p.location) locations.set(p.location, (locations.get(p.location) || 0) + 1);
  }
  for (const c of companies) {
    if (c.industry) industries.set(c.industry, (industries.get(c.industry) || 0) + 1);
  }

  // Growth over time
  const growthMap = new Map<string, number>();
  for (const c of connections) {
    if (c.connected_at) {
      const m = monthOf(c.connected_at);
      growthMap.set(m, (growthMap.get(m) || 0) + 1);
    }
  }
  const growth = Array.from(growthMap.entries())
    .map(([month, count]) => ({ month, count }))
    .filter((g) => g.month !== 'unknown')
    .sort((a, b) => a.month.localeCompare(b.month));

  // Message activity by month
  const msgMap = new Map<string, { inbound: number; outbound: number }>();
  let sent = 0;
  let received = 0;
  for (const m of messages) {
    const isInbound = m.direction === 'inbound';
    if (isInbound) received++;
    else sent++;
    if (m.sent_at) {
      const month = monthOf(m.sent_at);
      const entry = msgMap.get(month) || { inbound: 0, outbound: 0 };
      if (isInbound) entry.inbound++;
      else entry.outbound++;
      msgMap.set(month, entry);
    }
  }
  const byMonth = Array.from(msgMap.entries())
    .map(([month, v]) => ({ month, ...v }))
    .sort((a, b) => a.month.localeCompare(b.month));

  // Schools
  const schools = new Map<string, number>();
  for (const e of education) {
    if (e.school_name) schools.set(e.school_name, (schools.get(e.school_name) || 0) + 1);
  }

  return {
    networkComposition: {
      industries: topN(industries, 10),
      companies: topN(new Map(companies.map((c) => [c.canonical_name, 1])), 0),
      locations: topN(locations, 10),
    },
    growth,
    messageActivity: {
      byMonth,
      total: messages.length,
      sent,
      received,
    },
    topCompanies: companies.slice(0, 10).map((c) => ({
      name: c.canonical_name,
      people: 1,
    })),
    schools: topN(schools, 10).map((s) => ({ name: s.name, people: s.count })),
    totals: {
      connections: connections.length,
      companies: companies.length,
      messages: messages.length,
      schools: schools.size,
    },
  };
}
