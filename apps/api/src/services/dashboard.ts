import { query } from '@intel/shared';
import { getSelfContext } from './network.js';
import { signalSql, SIGNALS, type SignalKey } from './signals.js';
import type { Row } from './row.js';

export interface DashboardSummary {
  hasData: boolean;
  self: {
    name: string;
    headline: string | null;
    location: string | null;
    industry: string | null;
    profileUrl: string | null;
  } | null;
  totals: {
    connections: number;
    companies: number;
    currentCompanies: number;
    messages: number;
    conversations: number;
    schools: number;
    locations: number;
    industries: number;
    imports: number;
  };
  lastImportAt: string | null;
  growth: { month: string; added: number; cumulative: number }[];
  topCompanies: { id: string; name: string; total: number; current: number; former: number }[];
  topTitles: { value: string; count: number }[];
  topLocations: { value: string; count: number }[];
  topIndustries: { value: string; count: number }[];
  topSchools: { value: string; count: number }[];
  signals: { key: SignalKey; label: string; kind: string; rule: string; count: number }[];
  recentConnections: {
    id: string;
    name: string;
    currentCompany: string | null;
    currentTitle: string | null;
    connectedAt: string;
  }[];
  careerMoves: { id: string; name: string; from: string; to: string; observedAt: string }[];
  careerMoveCount: number;
  dataQuality: {
    withCompany: number;
    withTitle: number;
    withLocation: number;
    withEmail: number;
    withConnectionDate: number;
    total: number;
  };
}

/**
 * Everything the dashboard shows, in one round trip.
 *
 * Every number here is a count over imported rows. Nothing is estimated,
 * sampled or filled in, so a metric that reads zero means the export did not
 * contain that data.
 */
export async function getDashboard(workspaceId: string): Promise<DashboardSummary> {
  const self = await getSelfContext(workspaceId);
  const signals = signalSql('p', '$2::text[]', '$3::text[]');
  const signalCounts = Object.entries(signals)
    .map(([key, expr]) => `count(*) FILTER (WHERE ${expr})::int AS "${key}"`)
    .join(', ');

  const [
    totals,
    selfRow,
    lastImport,
    growth,
    topCompanies,
    topTitles,
    topLocations,
    topIndustries,
    topSchools,
    signalRow,
    recent,
    moves,
    moveCount,
    quality,
  ] = await Promise.all([
    query<Record<string, number>>(
      `SELECT
         (SELECT count(*)::int FROM people WHERE workspace_id = $1 AND NOT is_self)            AS connections,
         (SELECT count(*)::int FROM companies WHERE workspace_id = $1)                         AS companies,
         (SELECT count(*)::int FROM companies WHERE workspace_id = $1 AND current_count > 0)   AS current_companies,
         (SELECT count(*)::int FROM messages WHERE workspace_id = $1)                          AS messages,
         (SELECT count(*)::int FROM conversations WHERE workspace_id = $1)                     AS conversations,
         (SELECT count(DISTINCT lower(school_name))::int FROM education WHERE workspace_id = $1) AS schools,
         (SELECT count(DISTINCT location)::int FROM people WHERE workspace_id = $1 AND NOT is_self AND location IS NOT NULL) AS locations,
         (SELECT count(DISTINCT industry)::int FROM people WHERE workspace_id = $1 AND NOT is_self AND industry IS NOT NULL) AS industries,
         (SELECT count(*)::int FROM imports WHERE workspace_id = $1 AND status IN ('completed','partially_completed')) AS imports`,
      [workspaceId]
    ),
    query<Record<string, string>>(
      `SELECT canonical_name, headline, location, industry, profile_url
       FROM people WHERE workspace_id = $1 AND is_self LIMIT 1`,
      [workspaceId]
    ),
    query<{ uploaded_at: Date }>(
      `SELECT uploaded_at FROM imports WHERE workspace_id = $1 AND status IN ('completed','partially_completed')
       ORDER BY uploaded_at DESC LIMIT 1`,
      [workspaceId]
    ),
    query<{ month: string; added: number }>(
      `SELECT to_char(date_trunc('month', connected_at), 'YYYY-MM') AS month, count(*)::int AS added
       FROM people WHERE workspace_id = $1 AND NOT is_self AND connected_at IS NOT NULL
       GROUP BY 1 ORDER BY 1`,
      [workspaceId]
    ),
    query<Row>(
      `SELECT id, canonical_name, connection_count, current_count, former_count
       FROM companies WHERE workspace_id = $1 AND connection_count > 0
       ORDER BY connection_count DESC, canonical_name ASC LIMIT 12`,
      [workspaceId]
    ),
    topValues(workspaceId, 'current_title'),
    topValues(workspaceId, 'location'),
    topValues(workspaceId, 'industry'),
    query<{ value: string; count: number }>(
      `SELECT e.school_name AS value, count(DISTINCT e.person_id)::int AS count
       FROM education e JOIN people p ON p.id = e.person_id AND NOT p.is_self
       WHERE e.workspace_id = $1 AND e.school_name IS NOT NULL
       GROUP BY 1 ORDER BY count DESC, value ASC LIMIT 10`,
      [workspaceId]
    ),
    query<Record<string, number>>(
      `SELECT ${signalCounts} FROM people p WHERE p.workspace_id = $1 AND NOT p.is_self`,
      [workspaceId, self.companyKeys, self.schools]
    ),
    query<Row>(
      `SELECT id, canonical_name, current_company, current_title, connected_at
       FROM people WHERE workspace_id = $1 AND NOT is_self AND connected_at IS NOT NULL
       ORDER BY connected_at DESC LIMIT 8`,
      [workspaceId]
    ),
    query<Row>(
      `SELECT p.id, p.canonical_name,
              prev.company_name AS from_company,
              cur.company_name  AS to_company,
              cur.observed_at
       FROM people p
       JOIN LATERAL (
         SELECT company_name, observed_at FROM person_employment
         WHERE person_id = p.id AND is_current AND company_name IS NOT NULL
         ORDER BY observed_at DESC LIMIT 1
       ) cur ON true
       JOIN LATERAL (
         SELECT company_name FROM person_employment
         WHERE person_id = p.id AND NOT is_current AND company_name IS NOT NULL
         ORDER BY observed_at DESC LIMIT 1
       ) prev ON true
       WHERE p.workspace_id = $1 AND NOT p.is_self AND lower(prev.company_name) <> lower(cur.company_name)
       ORDER BY cur.observed_at DESC LIMIT 10`,
      [workspaceId]
    ),
    query<{ count: number }>(
      `SELECT count(*)::int AS count FROM (
         SELECT p.id
         FROM people p
         JOIN LATERAL (
           SELECT company_name FROM person_employment
           WHERE person_id = p.id AND is_current AND company_name IS NOT NULL
           ORDER BY observed_at DESC LIMIT 1
         ) cur ON true
         JOIN LATERAL (
           SELECT company_name FROM person_employment
           WHERE person_id = p.id AND NOT is_current AND company_name IS NOT NULL
           ORDER BY observed_at DESC LIMIT 1
         ) prev ON true
         WHERE p.workspace_id = $1 AND NOT p.is_self AND lower(prev.company_name) <> lower(cur.company_name)
       ) t`,
      [workspaceId]
    ),
    query<Record<string, number>>(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE current_company IS NOT NULL)::int AS with_company,
              count(*) FILTER (WHERE current_title IS NOT NULL)::int   AS with_title,
              count(*) FILTER (WHERE location IS NOT NULL)::int        AS with_location,
              count(*) FILTER (WHERE email IS NOT NULL)::int           AS with_email,
              count(*) FILTER (WHERE connected_at IS NOT NULL)::int    AS with_connection_date
       FROM people WHERE workspace_id = $1 AND NOT is_self`,
      [workspaceId]
    ),
  ]);

  let cumulative = 0;
  const growthSeries = growth.map((g) => {
    cumulative += Number(g.added);
    return { month: g.month, added: Number(g.added), cumulative };
  });

  const t = totals[0] ?? {};
  const q = quality[0] ?? {};

  return {
    hasData: Number(t.connections ?? 0) > 0,
    self: selfRow[0]
      ? {
          name: selfRow[0].canonical_name,
          headline: selfRow[0].headline ?? null,
          location: selfRow[0].location ?? null,
          industry: selfRow[0].industry ?? null,
          profileUrl: selfRow[0].profile_url ?? null,
        }
      : null,
    totals: {
      connections: Number(t.connections ?? 0),
      companies: Number(t.companies ?? 0),
      currentCompanies: Number(t.current_companies ?? 0),
      messages: Number(t.messages ?? 0),
      conversations: Number(t.conversations ?? 0),
      schools: Number(t.schools ?? 0),
      locations: Number(t.locations ?? 0),
      industries: Number(t.industries ?? 0),
      imports: Number(t.imports ?? 0),
    },
    lastImportAt: lastImport[0] ? new Date(lastImport[0].uploaded_at).toISOString() : null,
    growth: growthSeries,
    topCompanies: topCompanies.map((c) => ({
      id: c.id,
      name: c.canonical_name,
      total: c.connection_count,
      current: c.current_count,
      former: c.former_count,
    })),
    topTitles,
    topLocations,
    topIndustries,
    topSchools,
    signals: (Object.keys(SIGNALS) as SignalKey[]).map((key) => ({
      key,
      label: SIGNALS[key].label,
      kind: SIGNALS[key].kind,
      rule: SIGNALS[key].rule,
      count: Number(signalRow[0]?.[key] ?? 0),
    })),
    recentConnections: recent.map((r) => ({
      id: r.id,
      name: r.canonical_name,
      currentCompany: r.current_company ?? null,
      currentTitle: r.current_title ?? null,
      connectedAt: new Date(r.connected_at).toISOString(),
    })),
    careerMoves: moves.map((m) => ({
      id: m.id,
      name: m.canonical_name,
      from: m.from_company,
      to: m.to_company,
      observedAt: new Date(m.observed_at).toISOString(),
    })),
    careerMoveCount: Number(moveCount[0]?.count ?? 0),
    dataQuality: {
      total: Number(q.total ?? 0),
      withCompany: Number(q.with_company ?? 0),
      withTitle: Number(q.with_title ?? 0),
      withLocation: Number(q.with_location ?? 0),
      withEmail: Number(q.with_email ?? 0),
      withConnectionDate: Number(q.with_connection_date ?? 0),
    },
  };
}

const TOP_VALUE_COLUMNS = new Set(['current_title', 'location', 'industry', 'current_company']);

async function topValues(workspaceId: string, column: string, limit = 10) {
  if (!TOP_VALUE_COLUMNS.has(column)) throw new Error(`Unsupported facet column ${column}`);
  return query<{ value: string; count: number }>(
    `SELECT ${column} AS value, count(*)::int AS count
     FROM people WHERE workspace_id = $1 AND NOT is_self AND ${column} IS NOT NULL
     GROUP BY 1 ORDER BY count DESC, value ASC LIMIT $2`,
    [workspaceId, limit]
  );
}

export interface Opportunity {
  personId: string;
  name: string;
  currentCompany: string | null;
  currentTitle: string | null;
  profileUrl: string | null;
  reasons: string[];
  connectedAt: string | null;
  lastInteractionAt: string | null;
}

/**
 * Reconnect suggestions.
 *
 * Purely rule-based and each one states why it surfaced, so the user can judge
 * it. No ranking model, no invented affinity score.
 */
export async function getOpportunities(workspaceId: string, limit = 20): Promise<Opportunity[]> {
  const self = await getSelfContext(workspaceId);
  const signals = signalSql('p', '$2::text[]', '$3::text[]');

  const rows = await query<Row>(
    `SELECT p.id, p.canonical_name, p.current_company, p.current_title, p.profile_url,
            p.connected_at, p.last_interaction_at,
            (${signals.dormant})         AS is_dormant,
            (${signals.changed_company}) AS has_moved,
            (${signals.shared_company})  AS shared_company,
            (${signals.shared_school})   AS shared_school,
            (${signals.long_standing})   AS long_standing
     FROM people p
     WHERE p.workspace_id = $1 AND NOT p.is_self
       AND ((${signals.dormant}) OR (${signals.changed_company}) OR (${signals.shared_company}) OR (${signals.shared_school}))
     ORDER BY
       ((${signals.changed_company}))::int DESC,
       ((${signals.shared_company}))::int DESC,
       ((${signals.shared_school}))::int DESC,
       p.connected_at ASC NULLS LAST
     LIMIT $4`,
    [workspaceId, self.companyKeys, self.schools, limit]
  );

  return rows.map((r) => {
    const reasons: string[] = [];
    if (r.has_moved) reasons.push('Changed company since your last import');
    if (r.shared_company) reasons.push('Worked at a company you also worked at');
    if (r.shared_school) reasons.push('Went to a school you also attended');
    if (r.is_dormant) reasons.push('Connected over 2 years ago with no recorded contact in the last year');
    if (r.long_standing) reasons.push('Connected more than 5 years ago');
    return {
      personId: r.id,
      name: r.canonical_name,
      currentCompany: r.current_company ?? null,
      currentTitle: r.current_title ?? null,
      profileUrl: r.profile_url ?? null,
      reasons,
      connectedAt: r.connected_at ? new Date(r.connected_at).toISOString() : null,
      lastInteractionAt: r.last_interaction_at ? new Date(r.last_interaction_at).toISOString() : null,
    };
  });
}
