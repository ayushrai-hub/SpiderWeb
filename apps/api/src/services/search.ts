import { getSupabase } from '@intel/shared';

export interface SearchOptions {
  workspaceId: string;
  query: string;
  types?: string[];
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  id: string;
  type: 'person' | 'company' | 'message' | 'conversation' | 'job' | 'activity' | 'skill' | 'insight';
  title: string;
  snippet: string;
  score: number;
  metadata: Record<string, any>;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  query: string;
  types: string[];
}

export async function searchPeople(
  workspaceId: string,
  query: string,
  limit: number = 20
): Promise<SearchResult[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('people')
    .select('*')
    .eq('workspace_id', workspaceId)
    .or(`full_name.ilike.%${query}%,email.ilike.%${query}%,company_name.ilike.%${query}%,title.ilike.%${query}%`)
    .limit(limit);

  if (error) throw error;

  return (data || []).map(person => ({
    id: person.id,
    type: 'person' as const,
    title: person.full_name,
    snippet: [person.title, person.company_name, person.location].filter(Boolean).join(' • '),
    score: 1.0,
    metadata: {
      email: person.email,
      company: person.company_name,
      title: person.title,
      location: person.location,
      profileUrl: person.profile_url,
    },
  }));
}

export async function searchCompanies(
  workspaceId: string,
  query: string,
  limit: number = 20
): Promise<SearchResult[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('workspace_id', workspaceId)
    .or(`canonical_name.ilike.%${query}%,industry.ilike.%${query}%,location.ilike.%${query}%`)
    .limit(limit);

  if (error) throw error;

  return (data || []).map(company => ({
    id: company.id,
    type: 'company' as const,
    title: company.canonical_name,
    snippet: [company.industry, company.size, company.location].filter(Boolean).join(' • '),
    score: 1.0,
    metadata: {
      industry: company.industry,
      size: company.size,
      location: company.location,
      linkedinUrl: company.linkedin_url,
    },
  }));
}

export async function searchMessages(
  workspaceId: string,
  query: string,
  limit: number = 20
): Promise<SearchResult[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('workspace_id', workspaceId)
    .ilike('content', `%${query}%`)
    .limit(limit);

  if (error) throw error;

  return (data || []).map(message => ({
    id: message.id,
    type: 'message' as const,
    title: `Message from ${message.sender_id || 'Unknown'}`,
    snippet: message.content?.substring(0, 200) || '',
    score: 1.0,
    metadata: {
      direction: message.direction,
      sentAt: message.sent_at,
      conversationId: message.conversation_id,
    },
  }));
}

export async function searchConversations(
  workspaceId: string,
  query: string,
  limit: number = 20
): Promise<SearchResult[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('workspace_id', workspaceId)
    .ilike('title', `%${query}%`)
    .limit(limit);

  if (error) throw error;

  return (data || []).map(conv => ({
    id: conv.id,
    type: 'conversation' as const,
    title: conv.title || 'Untitled Conversation',
    snippet: `Started ${conv.created_at ? new Date(conv.created_at).toLocaleDateString() : 'Unknown'}`,
    score: 1.0,
    metadata: {
      createdAt: conv.created_at,
      updatedAt: conv.updated_at,
    },
  }));
}

export async function searchJobs(
  workspaceId: string,
  query: string,
  limit: number = 20
): Promise<SearchResult[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('workspace_id', workspaceId)
    .or(`title.ilike.%${query}%,company.ilike.%${query}%,location.ilike.%${query}%`)
    .limit(limit);

  if (error) throw error;

  return (data || []).map(job => ({
    id: job.id,
    type: 'job' as const,
    title: job.title,
    snippet: [job.company, job.location].filter(Boolean).join(' • '),
    score: 1.0,
    metadata: {
      company: job.company,
      location: job.location,
      url: job.url,
      postedAt: job.posted_at,
    },
  }));
}

export async function searchActivities(
  workspaceId: string,
  query: string,
  limit: number = 20
): Promise<SearchResult[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('activities')
    .select('*')
    .eq('workspace_id', workspaceId)
    .ilike('content', `%${query}%`)
    .limit(limit);

  if (error) throw error;

  return (data || []).map(activity => ({
    id: activity.id,
    type: 'activity' as const,
    title: `${activity.activity_type} activity`,
    snippet: activity.content?.substring(0, 200) || '',
    score: 1.0,
    metadata: {
      type: activity.activity_type,
      contentUrl: activity.content_url,
      createdAt: activity.created_at,
    },
  }));
}

export async function searchSkills(
  workspaceId: string,
  query: string,
  limit: number = 20
): Promise<SearchResult[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('skills')
    .select('*')
    .eq('workspace_id', workspaceId)
    .ilike('skill', `%${query}%`)
    .limit(limit);

  if (error) throw error;

  return (data || []).map(skill => ({
    id: skill.id,
    type: 'skill' as const,
    title: skill.skill,
    snippet: `Endorsements: ${skill.endorsements || 0}`,
    score: 1.0,
    metadata: {
      endorsements: skill.endorsements,
      personId: skill.person_id,
    },
  }));
}

export async function globalSearch(options: SearchOptions): Promise<SearchResponse> {
  const { workspaceId, query, types = ['person', 'company', 'message', 'conversation', 'job', 'activity', 'skill'], limit = 20 } = options;

  const results: SearchResult[] = [];

  const searchFunctions: Record<string, () => Promise<SearchResult[]>> = {
    person: () => searchPeople(workspaceId, query, limit),
    company: () => searchCompanies(workspaceId, query, limit),
    message: () => searchMessages(workspaceId, query, limit),
    conversation: () => searchConversations(workspaceId, query, limit),
    job: () => searchJobs(workspaceId, query, limit),
    activity: () => searchActivities(workspaceId, query, limit),
    skill: () => searchSkills(workspaceId, query, limit),
  };

  for (const type of types) {
    if (searchFunctions[type]) {
      try {
        const typeResults = await searchFunctions[type]();
        results.push(...typeResults);
      } catch (err) {
        console.error(`Search error for type ${type}:`, err);
      }
    }
  }

  // Sort by score and limit
  results.sort((a, b) => b.score - a.score);
  const limitedResults = results.slice(0, limit);

  return {
    results: limitedResults,
    total: results.length,
    query,
    types,
  };
}

export async function semanticSearch(
  workspaceId: string,
  query: string,
  limit: number = 20
): Promise<SearchResult[]> {
  // Try semantic search with embeddings first
  try {
    const { getDb } = await import('@intel/shared');
    const { getLLMGateway } = await import('@intel/ai');
    
    const db = getDb();
    const gateway = getLLMGateway();
    
    // Generate embedding for query
    const response = await gateway.embed('system', 'openai', {
      model: 'text-embedding-3-small',
      input: query,
    });
    const queryEmbedding = response.embeddings[0];
    
    // Search for similar embeddings using cosine similarity
    // Note: This requires pgvector extension
    const results = await db.execute(`
      SELECT 
        ve.entity_type,
        ve.entity_id,
        1 - (ve.embedding_vector <=> '${queryEmbedding}'::vector) as similarity
      FROM vector_embeddings ve
      WHERE ve.workspace_id = '${workspaceId}'
      ORDER BY similarity DESC
      LIMIT ${limit}
    `);
    
    // Map results to SearchResult format
    return results.map((row: Record<string, unknown>) => ({
      id: row.entity_id as string,
      type: row.entity_type as 'person' | 'company' | 'message' | 'conversation' | 'job' | 'activity' | 'skill' | 'insight',
      title: `${row.entity_type} ${row.entity_id}`,
      snippet: `Semantic match (${((row.similarity as number) * 100).toFixed(1)}% similar)`,
      score: row.similarity as number,
      metadata: { semantic: true },
    }));
  } catch {
    // Fall back to text search if pgvector not available
    console.log('Semantic search not available, falling back to text search');
    const result = await globalSearch({
      workspaceId,
      query,
      types: ['person', 'company', 'message', 'conversation'],
      limit,
    });
    return result.results;
  }
}
