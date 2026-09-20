import { query } from '@intel/shared';
import { companyKey } from '@intel/ingestion';
import {
  SIGNALS,
  isSignalKey,
  signalExpression,
  signalSql,
  type SignalKey,
  type SignalParams,
} from './signals.js';
import type { Row } from './row.js';

export interface PersonFilters {
  q?: string;
  company?: string;
  pastCompany?: string;
  title?: string;
  location?: string;
  industry?: string;
  school?: string;
  tag?: string;
  connectedAfter?: string;
  connectedBefore?: string;
  signals?: SignalKey[];
  sort?: 'name' | 'connected_desc' | 'connected_asc' | 'company' | 'interaction' | 'relevance';
  page: number;
  limit: number;
}

export interface PersonListItem {
  id: string;
  name: string;
  headline: string | null;
  currentCompany: string | null;
  currentTitle: string | null;
  location: string | null;
  industry: string | null;
  profileUrl: string | null;
  email: string | null;
  connectedAt: string | null;
  lastInteractionAt: string | null;
  interactionCount: number;
  signals: SignalKey[];
  tags: string[];
}

/** Values the workspace owner's own profile contributes to overlap signals. */
interface SelfContext {
  personId: string | null;
  companyKeys: string[];
  schools: string[];
}

export async function getSelfContext(workspaceId: string): Promise<SelfContext> {
  const [self] = await query<{ id: string }>(
    `SELECT id FROM people WHERE workspace_id = $1 AND is_self LIMIT 1`,
    [workspaceId]
  );
  if (!self) return { personId: null, companyKeys: [], schools: [] };

  const [companies, schools] = await Promise.all([
    query<{ company_key: string }>(
      `SELECT DISTINCT company_key FROM person_employment
       WHERE person_id = $1 AND company_key IS NOT NULL`,
      [self.id]
    ),
    query<{ school: string }>(
      `SELECT DISTINCT lower(school_name) AS school FROM education
       WHERE person_id = $1 AND school_name IS NOT NULL`,
      [self.id]
    ),
  ]);

  return {
    personId: self.id,
    companyKeys: companies.map((c) => c.company_key),
    schools: schools.map((s) => s.school),
  };
}

class Where {
  readonly params: unknown[] = [];
  private readonly clauses: string[] = [];

  param(value: unknown): string {
    this.params.push(value);
    return `$${this.params.length}`;
  }

  add(clause: string): void {
    this.clauses.push(clause);
  }

  get sql(): string {
    return this.clauses.length ? `WHERE ${this.clauses.join(' AND ')}` : '';
  }
}

const SORTS: Record<NonNullable<PersonFilters['sort']>, string> = {
  name: 'p.canonical_name ASC',
  connected_desc: 'p.connected_at DESC NULLS LAST, p.canonical_name ASC',
  connected_asc: 'p.connected_at ASC NULLS LAST, p.canonical_name ASC',
  company: 'p.current_company ASC NULLS LAST, p.canonical_name ASC',
  interaction: 'p.last_interaction_at DESC NULLS LAST, p.interaction_count DESC, p.canonical_name ASC',
  relevance: 'rank DESC, p.canonical_name ASC',
};

/**
 * One filtered, sorted, paginated page of people.
 *
 * All filtering happens in Postgres against indexed columns — the browser never
 * receives more than one page, so a 20,000-connection network behaves the same
 * as a 200-connection one.
 */
export async function listPeople(
  workspaceId: string,
  filters: PersonFilters,
  self: SelfContext
): Promise<{ rows: PersonListItem[]; total: number }> {
  const w = new Where();
  const wsParam = w.param(workspaceId);
  w.add(`p.workspace_id = ${wsParam}`);
  w.add('NOT p.is_self');

  let rankExpr = '0::float4';
  if (filters.q) {
    const term = filters.q.trim();
    const like = w.param(`%${term}%`);
    const tsq = w.param(term);
    const sim = w.param(term);
    w.add(`(p.search_document @@ plainto_tsquery('simple', ${tsq})
            OR p.canonical_name ILIKE ${like}
            OR p.current_company ILIKE ${like}
            OR p.canonical_name % ${sim})`);
    rankExpr = `GREATEST(
      ts_rank(p.search_document, plainto_tsquery('simple', ${tsq})),
      similarity(p.canonical_name, ${sim})
    )`;
  }

  // Company filters match on the normalised key the pipeline stored, so
  // "Acme", "Acme Corp" and "Acme, Inc." all select the same people.
  if (filters.company) {
    w.add(`EXISTS (
      SELECT 1 FROM person_employment e
      WHERE e.person_id = p.id AND e.is_current AND e.company_key = ${w.param(companyKey(filters.company))}
    )`);
  }
  if (filters.pastCompany) {
    w.add(`EXISTS (
      SELECT 1 FROM person_employment e
      WHERE e.person_id = p.id AND NOT e.is_current AND e.company_key = ${w.param(companyKey(filters.pastCompany))}
    )`);
  }
  if (filters.title) {
    w.add(`p.current_title ILIKE ${w.param(`%${filters.title}%`)}`);
  }
  if (filters.location) {
    w.add(`p.location ILIKE ${w.param(`%${filters.location}%`)}`);
  }
  if (filters.industry) {
    w.add(`lower(p.industry) = lower(${w.param(filters.industry)})`);
  }
  if (filters.school) {
    w.add(`EXISTS (
      SELECT 1 FROM education ed WHERE ed.person_id = p.id AND ed.school_name ILIKE ${w.param(`%${filters.school}%`)}
    )`);
  }
  if (filters.tag) {
    w.add(`EXISTS (
      SELECT 1 FROM person_tags pt JOIN tags t ON t.id = pt.tag_id
      WHERE pt.person_id = p.id AND lower(t.name) = lower(${w.param(filters.tag)})
    )`);
  }
  if (filters.connectedAfter) {
    w.add(`p.connected_at >= ${w.param(filters.connectedAfter)}::timestamptz`);
  }
  if (filters.connectedBefore) {
    w.add(`p.connected_at <= ${w.param(filters.connectedBefore)}::timestamptz`);
  }

  // Bound lazily: Postgres rejects a statement that binds a parameter it never
  // references, and the COUNT query only contains the filters actually used.
  let companiesRef: string | null = null;
  let schoolsRef: string | null = null;
  const lazyParams: SignalParams = {
    companies: () => (companiesRef ??= `${w.param(self.companyKeys)}::text[]`),
    schools: () => (schoolsRef ??= `${w.param(self.schools)}::text[]`),
  };

  for (const key of filters.signals ?? []) {
    w.add(`(${signalExpression(key, 'p', lazyParams)})`);
  }

  const [countRow] = await query<{ count: number }>(
    `SELECT count(*)::int AS count FROM people p ${w.sql}`,
    w.params
  );
  const total = countRow?.count ?? 0;
  if (total === 0) return { rows: [], total: 0 };

  const sort = SORTS[filters.sort ?? (filters.q ? 'relevance' : 'connected_desc')];
  const signals = signalSql('p', lazyParams.companies(), lazyParams.schools());
  const limit = w.param(filters.limit);
  const offset = w.param((filters.page - 1) * filters.limit);

  const signalSelect = Object.entries(signals)
    .map(([key, expr]) => `CASE WHEN ${expr} THEN '${key}' END`)
    .join(', ');

  const rows = await query<Record<string, unknown>>(
    `SELECT p.id, p.canonical_name, p.headline, p.current_company, p.current_title,
            p.location, p.industry, p.profile_url, p.email, p.connected_at,
            p.last_interaction_at, p.interaction_count,
            ${rankExpr} AS rank,
            ARRAY_REMOVE(ARRAY[${signalSelect}], NULL) AS signals,
            COALESCE(
              (SELECT array_agg(t.name ORDER BY t.name)
               FROM person_tags pt JOIN tags t ON t.id = pt.tag_id
               WHERE pt.person_id = p.id),
              '{}'
            ) AS tags
     FROM people p
     ${w.sql}
     ORDER BY ${sort}
     LIMIT ${limit} OFFSET ${offset}`,
    w.params
  );

  return { rows: rows.map(toListItem), total };
}

function toListItem(r: Row): PersonListItem {
  return {
    id: r.id,
    name: r.canonical_name,
    headline: r.headline ?? null,
    currentCompany: r.current_company ?? null,
    currentTitle: r.current_title ?? null,
    location: r.location ?? null,
    industry: r.industry ?? null,
    profileUrl: r.profile_url ?? null,
    email: r.email ?? null,
    connectedAt: r.connected_at ? new Date(r.connected_at).toISOString() : null,
    lastInteractionAt: r.last_interaction_at ? new Date(r.last_interaction_at).toISOString() : null,
    interactionCount: r.interaction_count ?? 0,
    signals: ((r.signals ?? []) as string[]).filter(isSignalKey),
    tags: (r.tags ?? []) as string[],
  };
}

export interface FacetValue {
  value: string;
  count: number;
}

export interface Facets {
  companies: FacetValue[];
  locations: FacetValue[];
  industries: FacetValue[];
  titles: FacetValue[];
  schools: FacetValue[];
  tags: FacetValue[];
  signals: { key: SignalKey; label: string; kind: string; rule: string; count: number }[];
}

/** Filter options with live counts, so the UI never offers an empty filter. */
export async function getFacets(workspaceId: string, self: SelfContext, limit = 25): Promise<Facets> {
  const signals = signalSql('p', '$2::text[]', '$3::text[]');
  const signalCounts = Object.entries(signals)
    .map(([key, expr]) => `count(*) FILTER (WHERE ${expr})::int AS "${key}"`)
    .join(', ');

  const [companies, locations, industries, titles, schools, tags, signalRow] = await Promise.all([
    // Canonical company names, so the filter list has one entry per company
    // rather than one per spelling found in the export.
    query<FacetValue>(
      `SELECT canonical_name AS value, current_count AS count FROM companies
       WHERE workspace_id = $1 AND current_count > 0
       ORDER BY current_count DESC, canonical_name ASC LIMIT $2`,
      [workspaceId, limit]
    ),
    query<FacetValue>(
      `SELECT location AS value, count(*)::int AS count FROM people
       WHERE workspace_id = $1 AND NOT is_self AND location IS NOT NULL
       GROUP BY location ORDER BY count DESC, value ASC LIMIT $2`,
      [workspaceId, limit]
    ),
    query<FacetValue>(
      `SELECT industry AS value, count(*)::int AS count FROM people
       WHERE workspace_id = $1 AND NOT is_self AND industry IS NOT NULL
       GROUP BY industry ORDER BY count DESC, value ASC LIMIT $2`,
      [workspaceId, limit]
    ),
    query<FacetValue>(
      `SELECT current_title AS value, count(*)::int AS count FROM people
       WHERE workspace_id = $1 AND NOT is_self AND current_title IS NOT NULL
       GROUP BY current_title ORDER BY count DESC, value ASC LIMIT $2`,
      [workspaceId, limit]
    ),
    query<FacetValue>(
      `SELECT e.school_name AS value, count(DISTINCT e.person_id)::int AS count
       FROM education e JOIN people p ON p.id = e.person_id AND NOT p.is_self
       WHERE e.workspace_id = $1 AND e.school_name IS NOT NULL
       GROUP BY e.school_name ORDER BY count DESC, value ASC LIMIT $2`,
      [workspaceId, limit]
    ),
    query<FacetValue>(
      `SELECT t.name AS value, count(pt.person_id)::int AS count
       FROM tags t LEFT JOIN person_tags pt ON pt.tag_id = t.id
       WHERE t.workspace_id = $1 GROUP BY t.name ORDER BY count DESC, value ASC LIMIT $2`,
      [workspaceId, limit]
    ),
    query<Record<string, number>>(
      `SELECT ${signalCounts} FROM people p WHERE p.workspace_id = $1 AND NOT p.is_self`,
      [workspaceId, self.companyKeys, self.schools]
    ),
  ]);

  return {
    companies,
    locations,
    industries,
    titles,
    schools,
    tags,
    signals: (Object.keys(SIGNALS) as SignalKey[]).map((key) => ({
      key,
      label: SIGNALS[key].label,
      kind: SIGNALS[key].kind,
      rule: SIGNALS[key].rule,
      count: Number(signalRow[0]?.[key] ?? 0),
    })),
  };
}

export interface PersonDetail extends PersonListItem {
  firstName: string | null;
  lastName: string | null;
  employment: {
    id: string;
    companyId: string | null;
    companyName: string | null;
    title: string | null;
    description: string | null;
    startDate: string | null;
    endDate: string | null;
    isCurrent: boolean;
  }[];
  education: {
    id: string;
    schoolName: string | null;
    degree: string | null;
    fieldOfStudy: string | null;
    startDate: string | null;
    endDate: string | null;
  }[];
  skills: { id: string; name: string; endorsementCount: number }[];
  notes: { id: string; body: string; createdAt: string; updatedAt: string }[];
  conversations: { id: string; title: string | null; messageCount: number; lastMessageAt: string | null }[];
  interactions: { kind: string; occurredAt: string | null }[];
  sharedCompanies: string[];
  sharedSchools: string[];
  colleagueCount: number;
  firstSeenImportId: string | null;
}

export async function getPerson(
  workspaceId: string,
  personId: string,
  self: SelfContext
): Promise<PersonDetail | null> {
  const signals = signalSql('p', '$3::text[]', '$4::text[]');
  const signalSelect = Object.entries(signals)
    .map(([key, expr]) => `CASE WHEN ${expr} THEN '${key}' END`)
    .join(', ');

  const [person] = await query<Row>(
    `SELECT p.*, 0::float4 AS rank,
            ARRAY_REMOVE(ARRAY[${signalSelect}], NULL) AS signals,
            COALESCE((SELECT array_agg(t.name ORDER BY t.name)
                      FROM person_tags pt JOIN tags t ON t.id = pt.tag_id
                      WHERE pt.person_id = p.id), '{}') AS tags
     FROM people p
     WHERE p.workspace_id = $1 AND p.id = $2`,
    [workspaceId, personId, self.companyKeys, self.schools]
  );
  if (!person) return null;

  const [employment, education, skills, notes, conversations, interactions, colleagues] = await Promise.all([
    query<Row>(
      `SELECT id, company_id, company_name, title, description, start_date, end_date, is_current
       FROM person_employment WHERE person_id = $1 AND workspace_id = $2
       ORDER BY is_current DESC, started_on DESC NULLS LAST, observed_at DESC`,
      [personId, workspaceId]
    ),
    query<Row>(
      `SELECT id, school_name, degree, field_of_study, start_date, end_date
       FROM education WHERE person_id = $1 AND workspace_id = $2 ORDER BY end_date DESC NULLS LAST`,
      [personId, workspaceId]
    ),
    query<Row>(
      `SELECT id, name, endorsement_count FROM skills WHERE person_id = $1 AND workspace_id = $2
       ORDER BY endorsement_count DESC, name ASC`,
      [personId, workspaceId]
    ),
    query<Row>(
      `SELECT id, body, created_at, updated_at FROM person_notes
       WHERE person_id = $1 AND workspace_id = $2 ORDER BY created_at DESC`,
      [personId, workspaceId]
    ),
    query<Row>(
      `SELECT id, title, message_count, last_message_at FROM conversations
       WHERE person_id = $1 AND workspace_id = $2 ORDER BY last_message_at DESC NULLS LAST`,
      [personId, workspaceId]
    ),
    query<Row>(
      `SELECT kind, occurred_at FROM person_interactions
       WHERE person_id = $1 AND workspace_id = $2 ORDER BY occurred_at DESC NULLS LAST LIMIT 50`,
      [personId, workspaceId]
    ),
    query<{ count: number }>(
      `SELECT count(DISTINCT e2.person_id)::int AS count
       FROM person_employment e1
       JOIN person_employment e2
         ON e2.company_key = e1.company_key AND e2.workspace_id = e1.workspace_id AND e2.person_id <> e1.person_id
       JOIN people p2 ON p2.id = e2.person_id AND NOT p2.is_self
       WHERE e1.person_id = $1 AND e1.workspace_id = $2 AND e1.company_key IS NOT NULL`,
      [personId, workspaceId]
    ),
  ]);

  const personCompanyKeys = await query<{ company_key: string }>(
    `SELECT DISTINCT company_key FROM person_employment WHERE person_id = $1 AND company_key IS NOT NULL`,
    [personId]
  );
  const sharedCompanyKeys = personCompanyKeys
    .map((c) => c.company_key)
    .filter((k) => self.companyKeys.includes(k));
  const sharedCompanies = sharedCompanyKeys.length
    ? (
        await query<{ canonical_name: string }>(
          `SELECT canonical_name FROM companies WHERE workspace_id = $1 AND normalized_name = ANY($2)`,
          [workspaceId, sharedCompanyKeys]
        )
      ).map((c) => c.canonical_name)
    : [];

  const sharedSchools = education
    .filter((e) => e.school_name && self.schools.includes(String(e.school_name).toLowerCase()))
    .map((e) => e.school_name as string);

  return {
    ...toListItem(person),
    firstName: person.first_name ?? null,
    lastName: person.last_name ?? null,
    employment: employment.map((e) => ({
      id: e.id,
      companyId: e.company_id ?? null,
      companyName: e.company_name ?? null,
      title: e.title ?? null,
      description: e.description ?? null,
      startDate: e.start_date ?? null,
      endDate: e.end_date ?? null,
      isCurrent: Boolean(e.is_current),
    })),
    education: education.map((e) => ({
      id: e.id,
      schoolName: e.school_name ?? null,
      degree: e.degree ?? null,
      fieldOfStudy: e.field_of_study ?? null,
      startDate: e.start_date ?? null,
      endDate: e.end_date ?? null,
    })),
    skills: skills.map((s) => ({ id: s.id, name: s.name, endorsementCount: s.endorsement_count ?? 0 })),
    notes: notes.map((n) => ({
      id: n.id,
      body: n.body,
      createdAt: new Date(n.created_at).toISOString(),
      updatedAt: new Date(n.updated_at).toISOString(),
    })),
    conversations: conversations.map((c) => ({
      id: c.id,
      title: c.title ?? null,
      messageCount: c.message_count ?? 0,
      lastMessageAt: c.last_message_at ? new Date(c.last_message_at).toISOString() : null,
    })),
    interactions: interactions.map((i) => ({
      kind: i.kind,
      occurredAt: i.occurred_at ? new Date(i.occurred_at).toISOString() : null,
    })),
    sharedCompanies,
    sharedSchools,
    colleagueCount: colleagues[0]?.count ?? 0,
    firstSeenImportId: person.first_import_id ?? null,
  };
}
