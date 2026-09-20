import { query } from '@intel/shared';
import {
  answerQuestion,
  buildAnalyticsReport,
  contextForPerson,
  findOpportunities,
  parseQuestion,
  recordsForMetric,
  type AnalyticsReport,
  type NetworkFacts,
  type OpportunityQuery,
  type PersonFact,
} from '@intel/analytics';
import { getSelfContext } from './network.js';
import type { Row } from './row.js';

export async function loadNetworkFacts(workspaceId: string): Promise<NetworkFacts> {
  const selfCtx = await getSelfContext(workspaceId);

  const [people, employment, education, companies, imports, selfRow] = await Promise.all([
    query<Row>(
      `SELECT p.id, p.canonical_name, p.current_company, p.current_title, p.location, p.industry,
              p.profile_url, p.email, p.connected_at, p.last_interaction_at, p.interaction_count,
              p.first_import_id, p.last_import_id, e.company_key, e.company_id
       FROM people p
       LEFT JOIN LATERAL (
         SELECT company_key, company_id FROM person_employment
         WHERE person_id = p.id AND is_current
         ORDER BY observed_at DESC NULLS LAST
         LIMIT 1
       ) e ON true
       WHERE p.workspace_id = $1 AND NOT p.is_self`,
      [workspaceId]
    ),
    query<Row>(
      `SELECT person_id, company_id, company_name, company_key, title, is_current,
              start_date, end_date, started_on, ended_on, observed_at
       FROM person_employment WHERE workspace_id = $1`,
      [workspaceId]
    ),
    query<Row>(
      `SELECT person_id, school_name FROM education WHERE workspace_id = $1 AND school_name IS NOT NULL`,
      [workspaceId]
    ),
    query<Row>(
      `SELECT id, canonical_name, normalized_name, industry, current_count, former_count, connection_count
       FROM companies WHERE workspace_id = $1`,
      [workspaceId]
    ),
    query<Row>(
      `SELECT i.id, i.uploaded_at, i.status, i.filename,
              EXISTS (
                SELECT 1 FROM import_files f
                WHERE f.import_id = i.id AND f.dataset = 'connections'
              ) AS had_connections
       FROM imports i
       WHERE i.workspace_id = $1 AND i.status IN ('completed','partially_completed')
       ORDER BY i.uploaded_at ASC`,
      [workspaceId]
    ),
    selfCtx.personId
      ? query<Row>(
          `SELECT canonical_name, headline, location, industry, profile_url
           FROM people WHERE id = $1`,
          [selfCtx.personId]
        )
      : Promise.resolve([] as Row[]),
  ]);

  const self = selfCtx.personId
    ? {
        personId: selfCtx.personId,
        name: selfRow[0]?.canonical_name ?? 'You',
        headline: selfRow[0]?.headline ?? null,
        location: selfRow[0]?.location ?? null,
        industry: selfRow[0]?.industry ?? null,
        profileUrl: selfRow[0]?.profile_url ?? null,
        companyKeys: selfCtx.companyKeys,
        schools: selfCtx.schools,
      }
    : null;

  return {
    people: people.map(toPersonFact),
    employment: employment.map((e) => ({
      personId: e.person_id,
      companyId: e.company_id ?? null,
      companyName: e.company_name ?? null,
      companyKey: e.company_key ?? null,
      title: e.title ?? null,
      isCurrent: Boolean(e.is_current),
      startDate: e.start_date ?? null,
      endDate: e.end_date ?? null,
      startedOn: e.started_on ?? null,
      endedOn: e.ended_on ?? null,
      observedAt: e.observed_at ?? null,
    })),
    education: education.map((e) => ({
      personId: e.person_id,
      schoolName: e.school_name ?? null,
    })),
    companies: companies.map((c) => ({
      id: c.id,
      name: c.canonical_name,
      normalizedName: c.normalized_name,
      industry: c.industry ?? null,
      currentCount: c.current_count,
      formerCount: c.former_count,
      connectionCount: c.connection_count,
    })),
    imports: imports.map((i) => ({
      id: i.id,
      uploadedAt: i.uploaded_at,
      status: i.status,
      hadConnections: Boolean(i.had_connections),
      filename: i.filename ?? null,
    })),
    self,
  };
}

function toPersonFact(p: Row): PersonFact {
  return {
    id: p.id,
    name: p.canonical_name,
    currentCompany: p.current_company ?? null,
    currentCompanyKey: p.company_key ?? null,
    currentCompanyId: p.company_id ?? null,
    currentTitle: p.current_title ?? null,
    location: p.location ?? null,
    observedIndustry: p.industry ?? null,
    profileUrl: p.profile_url ?? null,
    email: p.email ?? null,
    connectedAt: p.connected_at ?? null,
    lastInteractionAt: p.last_interaction_at ?? null,
    interactionCount: p.interaction_count ?? 0,
    firstImportId: p.first_import_id ?? null,
    lastImportId: p.last_import_id ?? null,
  };
}

function compactReport(report: AnalyticsReport): AnalyticsReport {
  return {
    ...report,
    career: {
      ...report.career,
      moves: report.career.moves.slice(0, 250),
      flows: report.career.flows.slice(0, 100),
    },
    changes: {
      ...report.changes,
      newConnections: report.changes.newConnections.slice(0, 200),
      notSeenInLatestConnectionsImport: report.changes.notSeenInLatestConnectionsImport.slice(0, 200),
      companyChanges: report.changes.companyChanges.slice(0, 200),
      titleChanges: report.changes.titleChanges.slice(0, 200),
    },
  };
}

export async function getAnalyticsReport(workspaceId: string): Promise<AnalyticsReport> {
  const facts = await loadNetworkFacts(workspaceId);
  const report = compactReport(buildAnalyticsReport(facts));
  void persistSnapshot(workspaceId, report);
  return report;
}

async function persistSnapshot(workspaceId: string, report: AnalyticsReport): Promise<void> {
  try {
    await query(
      `INSERT INTO analytics_snapshots (workspace_id, snapshot_date, metric_type, metric_data)
       VALUES ($1, now(), 'network_report', $2::jsonb)`,
      [workspaceId, JSON.stringify(report)]
    );
  } catch {
    // Snapshot is an optimisation; a unique-timestamp collision is harmless.
  }
}

export async function getAnalyticsRecords(workspaceId: string, metric: string, value?: string) {
  const facts = await loadNetworkFacts(workspaceId);
  return recordsForMetric(facts, metric, value).map((p) => ({
    id: p.id,
    name: p.name,
    currentCompany: p.currentCompany ?? null,
    currentTitle: p.currentTitle ?? null,
    location: p.location ?? null,
    profileUrl: p.profileUrl ?? null,
    connectedAt: p.connectedAt ? new Date(p.connectedAt).toISOString() : null,
  }));
}

export async function askNetwork(workspaceId: string, question: string) {
  const facts = await loadNetworkFacts(workspaceId);
  const report = buildAnalyticsReport(facts);
  const intent = parseQuestion(question);
  return answerQuestion(intent, facts, {
    companies: report.composition.currentCompanies,
    industries: report.composition.industries,
    career: report.career,
    changes: report.changes,
  });
}

export async function getPersonContext(workspaceId: string, personId: string) {
  const facts = await loadNetworkFacts(workspaceId);
  return contextForPerson(facts, personId);
}

export async function queryOpportunities(workspaceId: string, q: OpportunityQuery, limit = 40) {
  const facts = await loadNetworkFacts(workspaceId);
  return findOpportunities(facts.people, facts.employment, facts.education, facts.self, new Date(), q, limit);
}

export async function listSegments(workspaceId: string) {
  return query<{ id: string; name: string; description: string | null; query: unknown; created_at: Date }>(
    `SELECT id, name, description, query, created_at FROM network_segments
     WHERE workspace_id = $1 ORDER BY name`,
    [workspaceId]
  );
}

export async function saveSegment(
  workspaceId: string,
  input: { name: string; description?: string; query: Record<string, unknown> }
) {
  const [row] = await query<Row>(
    `INSERT INTO network_segments (workspace_id, name, description, query)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (workspace_id, lower(name)) DO UPDATE
       SET description = EXCLUDED.description, query = EXCLUDED.query, updated_at = now()
     RETURNING id, name, description, query, created_at`,
    [workspaceId, input.name.trim(), input.description ?? null, JSON.stringify(input.query)]
  );
  return row;
}

export async function deleteSegment(workspaceId: string, segmentId: string) {
  const rows = await query<{ id: string }>(
    `DELETE FROM network_segments WHERE id = $1 AND workspace_id = $2 RETURNING id`,
    [segmentId, workspaceId]
  );
  return rows.length > 0;
}
