import { query } from '@intel/shared';
import type { Row } from './row.js';

export type GraphNodeType = 'self' | 'company' | 'school' | 'person' | 'cluster';

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  /** Number of people the node represents; drives visual weight. */
  size: number;
  entityId?: string;
  meta?: Record<string, string | number | null>;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: 'works_at' | 'worked_at' | 'studied_at' | 'moved_to' | 'in_cluster';
  weight: number;
}

export interface GraphResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  mode: 'overview' | 'company';
  kind: 'affiliation';
  caveat: string;
  truncated: { hiddenCompanies: number; hiddenPeople: number };
}

const MAX_HUBS = 40;
const MAX_PEOPLE = 300;
const AFFILIATION_CAVEAT =
  'This is an affiliation graph (you → company/school → people), not a map of who knows whom. LinkedIn exports do not include connections among your connections. Sharing a company is not evidence that two people know each other.';

/**
 * Network graph.
 *
 * Rendering one node per connection produces an unreadable hairball and a slow
 * canvas, so the overview is a hub graph: you at the centre, your largest
 * companies and schools as hubs, and edges weighted by how many people sit
 * behind each one. Individual people appear only when a company is focused,
 * and are capped.
 */
export async function getGraph(
  workspaceId: string,
  options: { focusCompanyId?: string; minSize?: number; includeSchools?: boolean } = {}
): Promise<GraphResult> {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const [self] = await query<{ id: string; canonical_name: string }>(
    `SELECT id, canonical_name FROM people WHERE workspace_id = $1 AND is_self LIMIT 1`,
    [workspaceId]
  );
  const selfId = 'self';
  nodes.push({
    id: selfId,
    type: 'self',
    label: self?.canonical_name ?? 'You',
    size: 1,
    entityId: self?.id,
  });

  if (options.focusCompanyId) {
    return focusedCompanyGraph(workspaceId, options.focusCompanyId, nodes, edges, selfId);
  }

  const minSize = Math.max(1, options.minSize ?? 1);

  const [companies, totalCompanies] = await Promise.all([
    query<Row>(
      `SELECT id, canonical_name, connection_count, current_count, former_count
       FROM companies
       WHERE workspace_id = $1 AND connection_count >= $2
       ORDER BY connection_count DESC, canonical_name ASC
       LIMIT $3`,
      [workspaceId, minSize, MAX_HUBS]
    ),
    query<{ count: number }>(
      `SELECT count(*)::int AS count FROM companies WHERE workspace_id = $1 AND connection_count >= $2`,
      [workspaceId, minSize]
    ),
  ]);

  for (const c of companies) {
    const nodeId = `company:${c.id}`;
    nodes.push({
      id: nodeId,
      type: 'company',
      label: c.canonical_name,
      size: c.connection_count,
      entityId: c.id,
      meta: { current: c.current_count, former: c.former_count },
    });
    if (c.current_count > 0) {
      edges.push({ source: selfId, target: nodeId, type: 'works_at', weight: c.current_count });
    }
    if (c.former_count > 0) {
      edges.push({ source: selfId, target: nodeId, type: 'worked_at', weight: c.former_count });
    }
  }

  const hiddenCompanies = Math.max(0, (totalCompanies[0]?.count ?? 0) - companies.length);
  if (hiddenCompanies > 0) {
    const [rest] = await query<{ people: number }>(
      `SELECT COALESCE(sum(connection_count), 0)::int AS people FROM (
         SELECT connection_count FROM companies
         WHERE workspace_id = $1 AND connection_count >= $2
         ORDER BY connection_count DESC, canonical_name ASC OFFSET $3
       ) t`,
      [workspaceId, minSize, MAX_HUBS]
    );
    nodes.push({
      id: 'cluster:companies',
      type: 'cluster',
      label: `${hiddenCompanies} smaller companies`,
      size: rest?.people ?? hiddenCompanies,
      meta: { companies: hiddenCompanies },
    });
    edges.push({
      source: selfId,
      target: 'cluster:companies',
      type: 'in_cluster',
      weight: rest?.people ?? 0,
    });
  }

  // Edges between companies people actually moved between — the only
  // company-to-company relationship the export can evidence.
  const companyIds = companies.map((c) => c.id);
  if (companyIds.length > 1) {
    const moves = await query<Row>(
      `SELECT a.company_id AS from_id, b.company_id AS to_id, count(DISTINCT a.person_id)::int AS weight
       FROM person_employment a
       JOIN person_employment b
         ON b.person_id = a.person_id AND b.company_id <> a.company_id AND b.is_current AND NOT a.is_current
       WHERE a.workspace_id = $1 AND a.company_id = ANY($2) AND b.company_id = ANY($2)
       GROUP BY 1, 2 HAVING count(DISTINCT a.person_id) > 0`,
      [workspaceId, companyIds]
    );
    for (const m of moves) {
      edges.push({
        source: `company:${m.from_id}`,
        target: `company:${m.to_id}`,
        type: 'moved_to',
        weight: m.weight,
      });
    }
  }

  if (options.includeSchools !== false) {
    const schools = await query<{ value: string; count: number }>(
      `SELECT ed.school_name AS value, count(DISTINCT ed.person_id)::int AS count
       FROM education ed JOIN people p ON p.id = ed.person_id AND NOT p.is_self
       WHERE ed.workspace_id = $1 AND ed.school_name IS NOT NULL
       GROUP BY 1 HAVING count(DISTINCT ed.person_id) >= $2
       ORDER BY count DESC LIMIT 12`,
      [workspaceId, minSize]
    );
    for (const s of schools) {
      const nodeId = `school:${s.value}`;
      nodes.push({ id: nodeId, type: 'school', label: s.value, size: s.count });
      edges.push({ source: selfId, target: nodeId, type: 'studied_at', weight: s.count });
    }
  }

  return {
    nodes,
    edges,
    mode: 'overview',
    kind: 'affiliation',
    caveat: AFFILIATION_CAVEAT,
    truncated: { hiddenCompanies, hiddenPeople: 0 },
  };
}

async function focusedCompanyGraph(
  workspaceId: string,
  companyId: string,
  nodes: GraphNode[],
  edges: GraphEdge[],
  selfId: string
): Promise<GraphResult> {
  const [company] = await query<Row>(
    `SELECT id, canonical_name, connection_count FROM companies WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, companyId]
  );
  if (!company) {
    return {
      nodes,
      edges,
      mode: 'company',
      kind: 'affiliation',
      caveat: AFFILIATION_CAVEAT,
      truncated: { hiddenCompanies: 0, hiddenPeople: 0 },
    };
  }

  const hubId = `company:${company.id}`;
  nodes.push({
    id: hubId,
    type: 'company',
    label: company.canonical_name,
    size: company.connection_count,
    entityId: company.id,
  });
  edges.push({ source: selfId, target: hubId, type: 'works_at', weight: company.connection_count });

  const people = await query<Row>(
    `SELECT DISTINCT ON (p.id) p.id, p.canonical_name, e.title, e.is_current
     FROM person_employment e
     JOIN people p ON p.id = e.person_id AND NOT p.is_self
     WHERE e.workspace_id = $1 AND e.company_id = $2
     ORDER BY p.id, e.is_current DESC
     LIMIT $3`,
    [workspaceId, companyId, MAX_PEOPLE]
  );

  for (const p of people) {
    const nodeId = `person:${p.id}`;
    nodes.push({
      id: nodeId,
      type: 'person',
      label: p.canonical_name,
      size: 1,
      entityId: p.id,
      meta: { title: p.title ?? null },
    });
    edges.push({
      source: nodeId,
      target: hubId,
      type: p.is_current ? 'works_at' : 'worked_at',
      weight: 1,
    });
  }

  const hiddenPeople = Math.max(0, company.connection_count - people.length);
  return {
    nodes,
    edges,
    mode: 'company',
    kind: 'affiliation',
    caveat: AFFILIATION_CAVEAT,
    truncated: { hiddenCompanies: 0, hiddenPeople },
  };
}
