import { query } from '@intel/shared';
import type { Row } from './row.js';

export interface CompanyListItem {
  id: string;
  name: string;
  industry: string | null;
  location: string | null;
  linkedinUrl: string | null;
  connectionCount: number;
  currentCount: number;
  formerCount: number;
}

export async function listCompanies(
  workspaceId: string,
  options: { q?: string; page: number; limit: number; sort?: 'connections' | 'name' }
): Promise<{ rows: CompanyListItem[]; total: number }> {
  const params: unknown[] = [workspaceId];
  let where = 'workspace_id = $1';
  if (options.q) {
    params.push(`%${options.q}%`);
    where += ` AND canonical_name ILIKE $${params.length}`;
  }

  const [countRow] = await query<{ count: number }>(
    `SELECT count(*)::int AS count FROM companies WHERE ${where}`,
    params
  );
  const total = countRow?.count ?? 0;
  if (total === 0) return { rows: [], total: 0 };

  const order = options.sort === 'name' ? 'canonical_name ASC' : 'connection_count DESC, canonical_name ASC';
  params.push(options.limit, (options.page - 1) * options.limit);

  const rows = await query<Row>(
    `SELECT id, canonical_name, industry, location, linkedin_url,
            connection_count, current_count, former_count
     FROM companies WHERE ${where}
     ORDER BY ${order}
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    total,
    rows: rows.map((c) => ({
      id: c.id,
      name: c.canonical_name,
      industry: c.industry ?? null,
      location: c.location ?? null,
      linkedinUrl: c.linkedin_url ?? null,
      connectionCount: c.connection_count,
      currentCount: c.current_count,
      formerCount: c.former_count,
    })),
  };
}

export interface CompanyDetail extends CompanyListItem {
  people: {
    id: string;
    name: string;
    title: string | null;
    isCurrent: boolean;
    location: string | null;
    profileUrl: string | null;
  }[];
  topTitles: { value: string; count: number }[];
  topLocations: { value: string; count: number }[];
  topSchools: { value: string; count: number }[];
  /** Companies your connections moved to or from. */
  relatedCompanies: { id: string; name: string; sharedPeople: number }[];
  selfWorkedHere: boolean;
}

export async function getCompany(workspaceId: string, companyId: string): Promise<CompanyDetail | null> {
  const [company] = await query<Row>(
    `SELECT id, canonical_name, industry, location, linkedin_url,
            connection_count, current_count, former_count
     FROM companies WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, companyId]
  );
  if (!company) return null;

  const [people, topTitles, topLocations, topSchools, related, selfRows] = await Promise.all([
    query<Row>(
      `SELECT DISTINCT ON (p.id) p.id, p.canonical_name, e.title, e.is_current, p.location, p.profile_url
       FROM person_employment e
       JOIN people p ON p.id = e.person_id AND NOT p.is_self
       WHERE e.workspace_id = $1 AND e.company_id = $2
       ORDER BY p.id, e.is_current DESC, e.observed_at DESC`,
      [workspaceId, companyId]
    ),
    query<{ value: string; count: number }>(
      `SELECT e.title AS value, count(DISTINCT e.person_id)::int AS count
       FROM person_employment e JOIN people p ON p.id = e.person_id AND NOT p.is_self
       WHERE e.workspace_id = $1 AND e.company_id = $2 AND e.title IS NOT NULL
       GROUP BY 1 ORDER BY count DESC, value ASC LIMIT 10`,
      [workspaceId, companyId]
    ),
    query<{ value: string; count: number }>(
      `SELECT p.location AS value, count(DISTINCT p.id)::int AS count
       FROM person_employment e JOIN people p ON p.id = e.person_id AND NOT p.is_self
       WHERE e.workspace_id = $1 AND e.company_id = $2 AND p.location IS NOT NULL
       GROUP BY 1 ORDER BY count DESC, value ASC LIMIT 10`,
      [workspaceId, companyId]
    ),
    query<{ value: string; count: number }>(
      `SELECT ed.school_name AS value, count(DISTINCT ed.person_id)::int AS count
       FROM person_employment e
       JOIN education ed ON ed.person_id = e.person_id
       WHERE e.workspace_id = $1 AND e.company_id = $2 AND ed.school_name IS NOT NULL
       GROUP BY 1 ORDER BY count DESC, value ASC LIMIT 10`,
      [workspaceId, companyId]
    ),
    query<Row>(
      `SELECT c.id, c.canonical_name, count(DISTINCT other.person_id)::int AS shared
       FROM person_employment here
       JOIN person_employment other
         ON other.person_id = here.person_id AND other.company_id <> here.company_id
       JOIN companies c ON c.id = other.company_id
       WHERE here.workspace_id = $1 AND here.company_id = $2
       GROUP BY c.id, c.canonical_name
       ORDER BY shared DESC, c.canonical_name ASC LIMIT 8`,
      [workspaceId, companyId]
    ),
    query<{ count: number }>(
      `SELECT count(*)::int AS count FROM person_employment e
       JOIN people p ON p.id = e.person_id AND p.is_self
       WHERE e.workspace_id = $1 AND e.company_id = $2`,
      [workspaceId, companyId]
    ),
  ]);

  return {
    id: company.id,
    name: company.canonical_name,
    industry: company.industry ?? null,
    location: company.location ?? null,
    linkedinUrl: company.linkedin_url ?? null,
    connectionCount: company.connection_count,
    currentCount: company.current_count,
    formerCount: company.former_count,
    people: people.map((p) => ({
      id: p.id,
      name: p.canonical_name,
      title: p.title ?? null,
      isCurrent: Boolean(p.is_current),
      location: p.location ?? null,
      profileUrl: p.profile_url ?? null,
    })),
    topTitles,
    topLocations,
    topSchools,
    relatedCompanies: related.map((r) => ({ id: r.id, name: r.canonical_name, sharedPeople: r.shared })),
    selfWorkedHere: (selfRows[0]?.count ?? 0) > 0,
  };
}
