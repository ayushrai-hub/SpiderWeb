import { getSupabase } from '@intel/shared';

export interface NetworkAnalytics {
  totalConnections: number;
  connectionsOverTime: Array<{ month: string; count: number }>;
  companiesRepresented: number;
  industries: Array<{ name: string; count: number }>;
  roles: Array<{ name: string; count: number }>;
  locations: Array<{ name: string; count: number }>;
  skills: Array<{ name: string; count: number }>;
  seniority: Array<{ level: string; count: number }>;
}

export interface CommunicationAnalytics {
  totalMessages: number;
  sentMessages: number;
  receivedMessages: number;
  conversations: number;
  uniqueContacts: number;
  messagesPerContact: Array<{ contactId: string; name: string; count: number }>;
  responseRate: number;
  averageResponseTime: number;
  unansweredConversations: number;
  activeConversations: number;
  dormantConversations: number;
}

export interface OutreachAnalytics {
  outreachVolume: number;
  uniqueProspects: number;
  uniqueCompanies: number;
  firstTouchMessages: number;
  followUps: number;
  replies: number;
  replyRate: number;
  timeToReply: number;
  outreachByMonth: Array<{ month: string; count: number }>;
  outreachByRole: Array<{ role: string; count: number }>;
  outreachByCompany: Array<{ company: string; count: number }>;
}

export interface CareerAnalytics {
  applications: number;
  applicationsOverTime: Array<{ month: string; count: number }>;
  companiesAppliedTo: number;
  savedJobs: number;
  jobCategories: Array<{ category: string; count: number }>;
  targetRoles: Array<{ role: string; count: number }>;
  applicationOutcomes: Array<{ outcome: string; count: number }>;
}

export interface ContentAnalytics {
  comments: number;
  reactions: number;
  shares: number;
  reposts: number;
  activityOverTime: Array<{ month: string; count: number }>;
  topics: Array<{ topic: string; count: number }>;
  engagementPatterns: Array<{ type: string; count: number }>;
}

export interface RelationshipAnalytics {
  frequentlyContacted: Array<{ personId: string; name: string; count: number }>;
  recentlyContacted: Array<{ personId: string; name: string; lastContact: Date }>;
  dormantRelationships: Array<{ personId: string; name: string; lastContact: Date }>;
  interactionFrequency: Array<{ frequency: string; count: number }>;
  companiesWithStrongestPresence: Array<{ company: string; connections: number }>;
}

export interface DataQualityAnalytics {
  totalSourceFiles: number;
  successfullyParsed: number;
  partiallyParsed: number;
  failed: number;
  empty: number;
  unknown: number;
  malformedRows: number;
  missingFields: number;
  duplicateEntities: number;
  unresolvedEntities: number;
  dataQualityScore: number;
}

export async function getNetworkAnalytics(workspaceId: string): Promise<NetworkAnalytics> {
  const supabase = getSupabase();

  const [connectionsResult, companiesResult, peopleResult] = await Promise.all([
    supabase.from('connections').select('*').eq('workspace_id', workspaceId),
    supabase.from('companies').select('*').eq('workspace_id', workspaceId),
    supabase.from('people').select('*').eq('workspace_id', workspaceId),
  ]);

  const connections = connectionsResult.data || [];
  const companies = companiesResult.data || [];
  const people = peopleResult.data || [];

  // Connections over time
  const connectionsByMonth = new Map<string, number>();
  for (const conn of connections) {
    if (conn.connected_at) {
      const date = new Date(conn.connected_at);
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      connectionsByMonth.set(month, (connectionsByMonth.get(month) || 0) + 1);
    }
  }

  // Industries from companies
  const industryCounts = new Map<string, number>();
  for (const company of companies) {
    if (company.industry) {
      industryCounts.set(company.industry, (industryCounts.get(company.industry) || 0) + 1);
    }
  }

  // Roles from people
  const roleCounts = new Map<string, number>();
  for (const person of people) {
    if (person.title) {
      roleCounts.set(person.title, (roleCounts.get(person.title) || 0) + 1);
    }
  }

  // Locations from people
  const locationCounts = new Map<string, number>();
  for (const person of people) {
    if (person.location) {
      locationCounts.set(person.location, (locationCounts.get(person.location) || 0) + 1);
    }
  }

  return {
    totalConnections: connections.length,
    connectionsOverTime: Array.from(connectionsByMonth.entries())
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    companiesRepresented: companies.length,
    industries: Array.from(industryCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20),
    roles: Array.from(roleCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20),
    locations: Array.from(locationCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20),
    skills: [], // Will be populated from skills table
    seniority: [], // Will be derived from titles
  };
}

export async function getCommunicationAnalytics(workspaceId: string): Promise<CommunicationAnalytics> {
  const supabase = getSupabase();

  const [messagesResult, conversationsResult] = await Promise.all([
    supabase.from('messages').select('*').eq('workspace_id', workspaceId),
    supabase.from('conversations').select('*').eq('workspace_id', workspaceId),
  ]);

  const messages = messagesResult.data || [];
  const conversations = conversationsResult.data || [];

  const sentMessages = messages.filter(m => m.direction === 'outbound').length;
  const receivedMessages = messages.filter(m => m.direction === 'inbound').length;

  // Messages per contact
  const contactMessages = new Map<string, number>();
  for (const msg of messages) {
    if (msg.sender_id) {
      contactMessages.set(msg.sender_id, (contactMessages.get(msg.sender_id) || 0) + 1);
    }
  }

  return {
    totalMessages: messages.length,
    sentMessages,
    receivedMessages,
    conversations: conversations.length,
    uniqueContacts: contactMessages.size,
    messagesPerContact: Array.from(contactMessages.entries())
      .map(([contactId, count]) => ({ contactId, name: '', count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20),
    responseRate: sentMessages > 0 ? receivedMessages / sentMessages : 0,
    averageResponseTime: 0, // Would need timestamp analysis
    unansweredConversations: 0,
    activeConversations: 0,
    dormantConversations: 0,
  };
}

export async function getOutreachAnalytics(workspaceId: string): Promise<OutreachAnalytics> {
  const supabase = getSupabase();

  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('direction', 'outbound');

  const outboundMessages = messages || [];

  // Outreach by month
  const byMonth = new Map<string, number>();
  for (const msg of outboundMessages) {
    if (msg.sent_at) {
      const date = new Date(msg.sent_at);
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      byMonth.set(month, (byMonth.get(month) || 0) + 1);
    }
  }

  return {
    outreachVolume: outboundMessages.length,
    uniqueProspects: 0, // Would need to count unique recipients
    uniqueCompanies: 0,
    firstTouchMessages: 0,
    followUps: 0,
    replies: 0,
    replyRate: 0,
    timeToReply: 0,
    outreachByMonth: Array.from(byMonth.entries())
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    outreachByRole: [],
    outreachByCompany: [],
  };
}

export async function getCareerAnalytics(workspaceId: string): Promise<CareerAnalytics> {
  const supabase = getSupabase();

  const [applicationsResult, savedJobsResult] = await Promise.all([
    supabase.from('job_applications').select('*').eq('workspace_id', workspaceId),
    supabase.from('saved_jobs').select('*').eq('workspace_id', workspaceId),
  ]);

  const applications = applicationsResult.data || [];
  const savedJobs = savedJobsResult.data || [];

  // Applications over time
  const byMonth = new Map<string, number>();
  for (const app of applications) {
    if (app.applied_at) {
      const date = new Date(app.applied_at);
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      byMonth.set(month, (byMonth.get(month) || 0) + 1);
    }
  }

  return {
    applications: applications.length,
    applicationsOverTime: Array.from(byMonth.entries())
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    companiesAppliedTo: 0,
    savedJobs: savedJobs.length,
    jobCategories: [],
    targetRoles: [],
    applicationOutcomes: [],
  };
}

export async function getContentAnalytics(workspaceId: string): Promise<ContentAnalytics> {
  const supabase = getSupabase();

  const { data: activities } = await supabase
    .from('activities')
    .select('*')
    .eq('workspace_id', workspaceId);

  const allActivities = activities || [];

  const comments = allActivities.filter(a => a.activity_type === 'comment').length;
  const reactions = allActivities.filter(a => a.activity_type === 'reaction').length;
  const shares = allActivities.filter(a => a.activity_type === 'share').length;
  const reposts = allActivities.filter(a => a.activity_type === 'repost').length;

  // Activity over time
  const byMonth = new Map<string, number>();
  for (const act of allActivities) {
    if (act.created_at) {
      const date = new Date(act.created_at);
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      byMonth.set(month, (byMonth.get(month) || 0) + 1);
    }
  }

  return {
    comments,
    reactions,
    shares,
    reposts,
    activityOverTime: Array.from(byMonth.entries())
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    topics: [],
    engagementPatterns: [],
  };
}

export async function getRelationshipAnalytics(workspaceId: string): Promise<RelationshipAnalytics> {
  const supabase = getSupabase();

  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('workspace_id', workspaceId);

  const allMessages = messages || [];

  // Message frequency by sender
  const senderCounts = new Map<string, number>();
  const senderLastContact = new Map<string, Date>();

  for (const msg of allMessages) {
    if (msg.sender_id) {
      senderCounts.set(msg.sender_id, (senderCounts.get(msg.sender_id) || 0) + 1);
      
      const sentAt = msg.sent_at ? new Date(msg.sent_at) : new Date();
      const existing = senderLastContact.get(msg.sender_id);
      if (!existing || sentAt > existing) {
        senderLastContact.set(msg.sender_id, sentAt);
      }
    }
  }

  // Frequently contacted
  const frequentlyContacted = Array.from(senderCounts.entries())
    .map(([personId, count]) => ({ personId, name: '', count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Recently contacted
  const recentlyContacted = Array.from(senderLastContact.entries())
    .map(([personId, lastContact]) => ({ personId, name: '', lastContact }))
    .sort((a, b) => b.lastContact.getTime() - a.lastContact.getTime())
    .slice(0, 10);

  // Dormant relationships (no contact in 90 days)
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const dormantRelationships = Array.from(senderLastContact.entries())
    .filter(([, lastContact]) => lastContact < cutoff)
    .map(([personId, lastContact]) => ({ personId, name: '', lastContact }))
    .sort((a, b) => a.lastContact.getTime() - b.lastContact.getTime())
    .slice(0, 10);

  return {
    frequentlyContacted,
    recentlyContacted,
    dormantRelationships,
    interactionFrequency: [],
    companiesWithStrongestPresence: [],
  };
}

export async function getDataQualityAnalytics(workspaceId: string): Promise<DataQualityAnalytics> {
  const supabase = getSupabase();

  const { data: imports } = await supabase
    .from('imports')
    .select('*')
    .eq('workspace_id', workspaceId);

  const allImports = imports || [];
  const totalFiles = allImports.reduce((sum, imp) => 
    sum + (imp.metadata?.stats?.filesDetected || 0), 0);
  const successfullyParsed = allImports.filter(imp => imp.status === 'completed').length;
  const failed = allImports.filter(imp => imp.status === 'failed').length;

  // Calculate data quality score based on measurable criteria
  const completionRate = allImports.length > 0 ? successfullyParsed / allImports.length : 0;
  const errorRate = allImports.length > 0 ? failed / allImports.length : 0;
  const dataQualityScore = Math.round((completionRate * 0.7 + (1 - errorRate) * 0.3) * 100);

  return {
    totalSourceFiles: totalFiles,
    successfullyParsed,
    partiallyParsed: 0,
    failed,
    empty: 0,
    unknown: 0,
    malformedRows: 0,
    missingFields: 0,
    duplicateEntities: 0,
    unresolvedEntities: 0,
    dataQualityScore,
  };
}
