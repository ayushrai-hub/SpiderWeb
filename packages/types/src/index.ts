// === Enums ===

export type WorkspaceRole = 'owner' | 'admin' | 'member';
export type DataSourceType = 'linkedin' | 'gmail' | 'outlook' | 'github' | 'crm' | 'csv' | 'json';
export type ImportStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type FileStatus = 'pending' | 'parsed' | 'normalized' | 'failed';
export type MessageDirection = 'inbound' | 'outbound';
export type ActivityType = 'post' | 'comment' | 'reaction' | 'share' | 'repost' | 'vote';
export type ConnectionStatus = 'connected' | 'invited' | 'pending';
export type AgentMessageRole = 'user' | 'assistant' | 'tool';

// === Core Types ===

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DataSource {
  id: string;
  workspaceId: string;
  sourceType: DataSourceType;
  name: string;
  createdAt: Date;
}

export interface Import {
  id: string;
  workspaceId: string;
  dataSourceId: string | null;
  sourceType: DataSourceType;
  sourceVersion: string | null;
  status: ImportStatus;
  uploadedAt: Date;
  processingStartedAt: Date | null;
  processingCompletedAt: Date | null;
  fileCount: number;
  recordCount: number;
  errorCount: number;
  warningCount: number;
  archiveS3Key: string | null;
  checksum: string | null;
}

// === Domain Types ===

export interface Person {
  id: string;
  workspaceId: string;
  canonicalName: string;
  firstName: string | null;
  lastName: string | null;
  headline: string | null;
  location: string | null;
  profileUrl: string | null;
  sourceType: string | null;
  sourceId: string | null;
  confidence: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Company {
  id: string;
  workspaceId: string;
  canonicalName: string;
  domain: string | null;
  linkedinUrl: string | null;
  industry: string | null;
  size: string | null;
  location: string | null;
  description: string | null;
  sourceType: string | null;
  confidence: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Connection {
  id: string;
  workspaceId: string;
  personId: string;
  connectedAt: Date | null;
  sourceFile: string | null;
  status: ConnectionStatus;
}

export interface Conversation {
  id: string;
  workspaceId: string;
  title: string | null;
  startedAt: Date | null;
  lastMessageAt: Date | null;
  messageCount: number;
  sourceType: string | null;
}

export interface Message {
  id: string;
  workspaceId: string;
  conversationId: string;
  senderId: string | null;
  content: string | null;
  sentAt: Date | null;
  direction: MessageDirection | null;
  sourceFile: string | null;
  hasAttachments: boolean;
}

export interface Job {
  id: string;
  workspaceId: string;
  companyId: string | null;
  companyName: string | null;
  title: string | null;
  description: string | null;
  location: string | null;
  url: string | null;
  sourceFile: string | null;
  createdAt: Date | null;
}

// === API Types ===

export interface ApiResponse<T> {
  data: T;
  meta?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown[];
  };
}

// === Analytics Types ===

export interface NetworkOverview {
  totalConnections: number;
  newConnections: number;
  companies: number;
  industries: Record<string, number>;
  roles: Record<string, number>;
  locations: Record<string, number>;
}

export interface CommunicationMetrics {
  totalConversations: number;
  totalMessages: number;
  outboundMessages: number;
  inboundMessages: number;
  responseRate: number;
  avgResponseTime: number;
  activeConversations: number;
  dormantConversations: number;
  unansweredConversations: number;
}

// === Agent Types ===

export interface AgentConversation {
  id: string;
  workspaceId: string;
  userId: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentMessage {
  id: string;
  conversationId: string;
  role: AgentMessageRole;
  content: string | null;
  toolName: string | null;
  toolInput: Record<string, unknown> | null;
  toolOutput: Record<string, unknown> | null;
  createdAt: Date;
}
