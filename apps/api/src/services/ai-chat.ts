import { getSupabase } from '@intel/shared';
import { globalSearch } from './search.js';
import {
  getNetworkAnalytics,
  getCommunicationAnalytics,
  getOutreachAnalytics,
  getCareerAnalytics,
  getContentAnalytics,
} from './analytics.js';
import {
  getConnectionsGraph,
  getCompanyGraph,
  getNetworkOverview,
} from './graph.js';

export interface AiMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolName?: string;
  toolInput?: Record<string, any>;
  toolOutput?: any;
}

export interface AiTool {
  name: string;
  description: string;
  parameters: Record<string, any>;
  execute: (params: Record<string, any>, workspaceId: string) => Promise<any>;
}

const tools: AiTool[] = [
  {
    name: 'search_people',
    description: 'Search for people in the workspace by name, email, company, or title',
    parameters: {
      query: { type: 'string', description: 'Search query' },
      limit: { type: 'number', description: 'Maximum results', default: 10 },
    },
    execute: async (params, workspaceId) => {
      const results = await globalSearch({
        workspaceId,
        query: params.query,
        types: ['person'],
        limit: params.limit || 10,
      });
      return results.results;
    },
  },
  {
    name: 'search_companies',
    description: 'Search for companies in the workspace by name, industry, or location',
    parameters: {
      query: { type: 'string', description: 'Search query' },
      limit: { type: 'number', description: 'Maximum results', default: 10 },
    },
    execute: async (params, workspaceId) => {
      const results = await globalSearch({
        workspaceId,
        query: params.query,
        types: ['company'],
        limit: params.limit || 10,
      });
      return results.results;
    },
  },
  {
    name: 'search_messages',
    description: 'Search through messages by content',
    parameters: {
      query: { type: 'string', description: 'Search query' },
      limit: { type: 'number', description: 'Maximum results', default: 10 },
    },
    execute: async (params, workspaceId) => {
      const results = await globalSearch({
        workspaceId,
        query: params.query,
        types: ['message'],
        limit: params.limit || 10,
      });
      return results.results;
    },
  },
  {
    name: 'search_conversations',
    description: 'Search for conversations by title or content',
    parameters: {
      query: { type: 'string', description: 'Search query' },
      limit: { type: 'number', description: 'Maximum results', default: 10 },
    },
    execute: async (params, workspaceId) => {
      const results = await globalSearch({
        workspaceId,
        query: params.query,
        types: ['conversation'],
        limit: params.limit || 10,
      });
      return results.results;
    },
  },
  {
    name: 'search_jobs',
    description: 'Search for jobs by title, company, or location',
    parameters: {
      query: { type: 'string', description: 'Search query' },
      limit: { type: 'number', description: 'Maximum results', default: 10 },
    },
    execute: async (params, workspaceId) => {
      const results = await globalSearch({
        workspaceId,
        query: params.query,
        types: ['job'],
        limit: params.limit || 10,
      });
      return results.results;
    },
  },
  {
    name: 'search_connections',
    description: 'Search through connections',
    parameters: {
      query: { type: 'string', description: 'Search query' },
      limit: { type: 'number', description: 'Maximum results', default: 10 },
    },
    execute: async (params, workspaceId) => {
      const results = await globalSearch({
        workspaceId,
        query: params.query,
        types: ['person'],
        limit: params.limit || 10,
      });
      return results.results;
    },
  },
  {
    name: 'search_activities',
    description: 'Search through activities like posts, comments, and reactions',
    parameters: {
      query: { type: 'string', description: 'Search query' },
      limit: { type: 'number', description: 'Maximum results', default: 10 },
    },
    execute: async (params, workspaceId) => {
      const results = await globalSearch({
        workspaceId,
        query: params.query,
        types: ['activity'],
        limit: params.limit || 10,
      });
      return results.results;
    },
  },
  {
    name: 'get_network_analytics',
    description: 'Get analytics about the professional network',
    parameters: {},
    execute: async (_params, workspaceId) => {
      return getNetworkAnalytics(workspaceId);
    },
  },
  {
    name: 'get_communication_analytics',
    description: 'Get analytics about messaging and communication',
    parameters: {},
    execute: async (_params, workspaceId) => {
      return getCommunicationAnalytics(workspaceId);
    },
  },
  {
    name: 'get_outreach_analytics',
    description: 'Get analytics about outreach efforts',
    parameters: {},
    execute: async (_params, workspaceId) => {
      return getOutreachAnalytics(workspaceId);
    },
  },
  {
    name: 'get_career_analytics',
    description: 'Get analytics about job applications and career',
    parameters: {},
    execute: async (_params, workspaceId) => {
      return getCareerAnalytics(workspaceId);
    },
  },
  {
    name: 'get_content_analytics',
    description: 'Get analytics about content engagement',
    parameters: {},
    execute: async (_params, workspaceId) => {
      return getContentAnalytics(workspaceId);
    },
  },
  {
    name: 'get_person',
    description: 'Get detailed information about a specific person',
    parameters: {
      personId: { type: 'string', description: 'Person ID' },
    },
    execute: async (params, workspaceId) => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('people')
        .select('*')
        .eq('id', params.personId)
        .eq('workspace_id', workspaceId)
        .single();

      if (error) throw error;
      return data;
    },
  },
  {
    name: 'get_company',
    description: 'Get detailed information about a specific company',
    parameters: {
      companyId: { type: 'string', description: 'Company ID' },
    },
    execute: async (params, workspaceId) => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('id', params.companyId)
        .eq('workspace_id', workspaceId)
        .single();

      if (error) throw error;
      return data;
    },
  },
  {
    name: 'get_conversation',
    description: 'Get detailed information about a specific conversation',
    parameters: {
      conversationId: { type: 'string', description: 'Conversation ID' },
    },
    execute: async (params, workspaceId) => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', params.conversationId)
        .eq('workspace_id', workspaceId)
        .single();

      if (error) throw error;
      return data;
    },
  },
  {
    name: 'graph_query',
    description: 'Query the knowledge graph for relationships',
    parameters: {
      query: { type: 'string', description: 'Graph query' },
      personId: { type: 'string', description: 'Person ID for person-specific queries' },
      companyId: { type: 'string', description: 'Company ID for company-specific queries' },
    },
    execute: async (params, workspaceId) => {
      if (params.personId) {
        return getConnectionsGraph(workspaceId, params.personId);
      } else if (params.companyId) {
        return getCompanyGraph(workspaceId, params.companyId);
      } else {
        return getNetworkOverview(workspaceId);
      }
    },
  },
  {
    name: 'semantic_search',
    description: 'Perform semantic search across all data',
    parameters: {
      query: { type: 'string', description: 'Search query' },
      limit: { type: 'number', description: 'Maximum results', default: 10 },
    },
    execute: async (params, workspaceId) => {
      const results = await globalSearch({
        workspaceId,
        query: params.query,
        limit: params.limit || 10,
      });
      return results.results;
    },
  },
  {
    name: 'get_insights',
    description: 'Get AI-generated insights about the data',
    parameters: {},
    execute: async (_params, workspaceId) => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('insights')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('generated_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return data;
    },
  },
];

export function getAvailableTools(): AiTool[] {
  return tools;
}

export function getToolByName(name: string): AiTool | undefined {
  return tools.find(t => t.name === name);
}

export async function executeTool(
  toolName: string,
  params: Record<string, any>,
  workspaceId: string
): Promise<any> {
  const tool = getToolByName(toolName);
  if (!tool) {
    throw new Error(`Unknown tool: ${toolName}`);
  }
  return tool.execute(params, workspaceId);
}

export function buildSystemPrompt(_workspaceId: string): string {
  return `You are a professional intelligence assistant. You have access to the user's professional network data including:
- People and connections
- Companies and organizations
- Messages and conversations
- Job applications and opportunities
- Activities and content
- Skills and education

You can use tools to search, analyze, and provide insights about this data. Always ground your responses in the actual data available. When presenting facts, clearly distinguish between:
- FACTS: Directly present in user data
- DERIVED METRICS: Calculated from user data
- INFERENCES: Model-generated interpretations
- EXTERNAL INFORMATION: Obtained through permitted sources

Be helpful, concise, and accurate. When unsure, say so rather than making assumptions.`;
}
