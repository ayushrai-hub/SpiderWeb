import { getSupabase } from '@intel/shared';

export interface GraphNode {
  id: string;
  type: 'person' | 'company' | 'skill' | 'conversation' | 'job';
  label: string;
  properties: Record<string, any>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  properties: Record<string, any>;
}

export interface GraphQueryResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export async function getConnectionsGraph(
  workspaceId: string,
  personId: string,
  depth: number = 2
): Promise<GraphQueryResult> {
  const supabase = getSupabase();
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const visited = new Set<string>();

  async function traverse(currentPersonId: string, currentDepth: number) {
    if (currentDepth > depth || visited.has(currentPersonId)) return;
    visited.add(currentPersonId);

    // Get person
    const { data: person } = await supabase
      .from('people')
      .select('*')
      .eq('id', currentPersonId)
      .single();

    if (person) {
      nodes.push({
        id: person.id,
        type: 'person',
        label: person.full_name,
        properties: {
          email: person.email,
          company: person.company_name,
          title: person.title,
        },
      });

      // Get connections
      const { data: connections } = await supabase
        .from('connections')
        .select('*, people!inner(*)')
        .eq('workspace_id', workspaceId)
        .eq('person_id', currentPersonId);

      for (const conn of connections || []) {
        const connectedPerson = conn.people;
        if (connectedPerson) {
          nodes.push({
            id: connectedPerson.id,
            type: 'person',
            label: connectedPerson.full_name,
            properties: {
              email: connectedPerson.email,
              company: connectedPerson.company_name,
              title: connectedPerson.title,
            },
          });

          edges.push({
            id: `conn-${conn.id}`,
            source: currentPersonId,
            target: connectedPerson.id,
            type: 'CONNECTED_TO',
            properties: {
              connectedAt: conn.connected_at,
              sourceFile: conn.source_file,
            },
          });

          await traverse(connectedPerson.id, currentDepth + 1);
        }
      }
    }
  }

  await traverse(personId, 0);
  return { nodes, edges };
}

export async function getCompanyGraph(
  workspaceId: string,
  companyId: string
): Promise<GraphQueryResult> {
  const supabase = getSupabase();
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // Get company
  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .single();

  if (company) {
    nodes.push({
      id: company.id,
      type: 'company',
      label: company.canonical_name,
      properties: {
        industry: company.industry,
        size: company.size,
        location: company.location,
      },
    });

    // Get people at company
    const { data: people } = await supabase
      .from('people')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('company_name', company.canonical_name);

    for (const person of people || []) {
      nodes.push({
        id: person.id,
        type: 'person',
        label: person.full_name,
        properties: {
          title: person.title,
          email: person.email,
        },
      });

      edges.push({
        id: `works-${person.id}`,
        source: person.id,
        target: company.id,
        type: 'WORKS_AT',
        properties: {},
      });
    }
  }

  return { nodes, edges };
}

export async function getNetworkOverview(
  workspaceId: string
): Promise<GraphQueryResult> {
  const supabase = getSupabase();
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // Get all people
  const { data: people } = await supabase
    .from('people')
    .select('*')
    .eq('workspace_id', workspaceId);

  for (const person of people || []) {
    nodes.push({
      id: person.id,
      type: 'person',
      label: person.full_name,
      properties: {
        company: person.company_name,
        title: person.title,
      },
    });
  }

  // Get all connections
  const { data: connections } = await supabase
    .from('connections')
    .select('*')
    .eq('workspace_id', workspaceId);

  for (const conn of connections || []) {
    edges.push({
      id: `conn-${conn.id}`,
      source: conn.person_id,
      target: conn.connected_to || conn.person_id,
      type: 'CONNECTED_TO',
      properties: {
        connectedAt: conn.connected_at,
      },
    });
  }

  return { nodes, edges };
}

export async function getPeopleAtCompany(
  workspaceId: string,
  companyName: string
): Promise<GraphQueryResult> {
  const supabase = getSupabase();
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const { data: people } = await supabase
    .from('people')
    .select('*')
    .eq('workspace_id', workspaceId)
    .ilike('company_name', `%${companyName}%`);

  for (const person of people || []) {
    nodes.push({
      id: person.id,
      type: 'person',
      label: person.full_name,
      properties: {
        title: person.title,
        email: person.email,
        location: person.location,
      },
    });
  }

  return { nodes, edges };
}

export async function getSharedSkills(
  workspaceId: string,
  personId1: string,
  personId2: string
): Promise<string[]> {
  const supabase = getSupabase();

  const { data: skills1 } = await supabase
    .from('skills')
    .select('skill')
    .eq('workspace_id', workspaceId)
    .eq('person_id', personId1);

  const { data: skills2 } = await supabase
    .from('skills')
    .select('skill')
    .eq('workspace_id', workspaceId)
    .eq('person_id', personId2);

  const skillsSet1 = new Set((skills1 || []).map(s => s.skill?.toLowerCase()));
  const skillsSet2 = new Set((skills2 || []).map(s => s.skill?.toLowerCase()));

  return Array.from(skillsSet1).filter(skill => skillsSet2.has(skill));
}

export async function getCareerTransitions(
  workspaceId: string,
  personId: string
): Promise<Array<{ from: string; to: string; date?: Date }>> {
  const supabase = getSupabase();

  const { data: employment } = await supabase
    .from('person_employment')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('person_id', personId)
    .order('start_date', { ascending: true });

  const transitions: Array<{ from: string; to: string; date?: Date }> = [];
  const employments = employment || [];

  for (let i = 1; i < employments.length; i++) {
    transitions.push({
      from: employments[i - 1].company_name || 'Unknown',
      to: employments[i].company_name || 'Unknown',
      date: employments[i].start_date ? new Date(employments[i].start_date) : undefined,
    });
  }

  return transitions;
}
