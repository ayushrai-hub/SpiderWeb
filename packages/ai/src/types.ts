export interface LLMProvider {
  id: string;
  name: string;
  models: LLMModel[];
  chat(request: LLMRequest): Promise<LLMResponse>;
  embed?(request: EmbeddingRequest): Promise<EmbeddingResponse>;
  listModels(): Promise<LLMModel[]>;
  validateKey(key: string): Promise<boolean>;
}

export interface LLMModel {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  maxOutput: number;
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsImages: boolean;
  inputCostPer1kTokens?: number;
  outputCostPer1kTokens?: number;
}

export interface LLMRequest {
  model: string;
  messages: LLMMessage[];
  tools?: LLMTool[];
  toolChoice?: 'auto' | 'none' | 'required';
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: LLMToolCall[];
}

export interface LLMTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LLMToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface LLMResponse {
  id: string;
  model: string;
  content: string;
  toolCalls?: LLMToolCall[];
  usage: LLMUsage;
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error';
  latencyMs: number;
}

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost?: number;
}

export interface EmbeddingRequest {
  model: string;
  input: string | string[];
}

export interface EmbeddingResponse {
  embeddings: number[][];
  model: string;
  dimensions: number;
  usage: {
    promptTokens: number;
    totalTokens: number;
  };
}

export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  organization?: string;
  maxRetries?: number;
  timeout?: number;
}

export interface UsageRecord {
  id: string;
  workspaceId: string;
  userId: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  latencyMs: number;
  feature: string;
  createdAt: Date;
}

export interface UsageLimits {
  dailyLimit: number;
  monthlyLimit: number;
  dailyUsed: number;
  monthlyUsed: number;
}
