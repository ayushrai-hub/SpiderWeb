import OpenAI from 'openai';
import type {
  LLMProvider,
  LLMModel,
  LLMRequest,
  LLMResponse,
  LLMUsage,
  ProviderConfig,
  EmbeddingRequest,
  EmbeddingResponse,
} from '../types.js';

const OPENAI_MODELS: LLMModel[] = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    contextWindow: 128000,
    maxOutput: 16384,
    supportsStreaming: true,
    supportsTools: true,
    supportsImages: true,
    inputCostPer1kTokens: 0.005,
    outputCostPer1kTokens: 0.015,
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    contextWindow: 128000,
    maxOutput: 16384,
    supportsStreaming: true,
    supportsTools: true,
    supportsImages: true,
    inputCostPer1kTokens: 0.00015,
    outputCostPer1kTokens: 0.0006,
  },
  {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    provider: 'openai',
    contextWindow: 128000,
    maxOutput: 4096,
    supportsStreaming: true,
    supportsTools: true,
    supportsImages: true,
    inputCostPer1kTokens: 0.01,
    outputCostPer1kTokens: 0.03,
  },
  {
    id: 'text-embedding-3-small',
    name: 'Text Embedding 3 Small',
    provider: 'openai',
    contextWindow: 8191,
    maxOutput: 0,
    supportsStreaming: false,
    supportsTools: false,
    supportsImages: false,
    inputCostPer1kTokens: 0.00002,
    outputCostPer1kTokens: 0,
  },
  {
    id: 'text-embedding-3-large',
    name: 'Text Embedding 3 Large',
    provider: 'openai',
    contextWindow: 8191,
    maxOutput: 0,
    supportsStreaming: false,
    supportsTools: false,
    supportsImages: false,
    inputCostPer1kTokens: 0.00013,
    outputCostPer1kTokens: 0,
  },
];

export class OpenAIProvider implements LLMProvider {
  id = 'openai';
  name = 'OpenAI';
  models = OPENAI_MODELS;
  private client: OpenAI;
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      organization: config.organization,
      maxRetries: config.maxRetries || 3,
      timeout: config.timeout || 60000,
    });
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();

    const messages = request.messages.map((m) => ({
      role: m.role as 'system' | 'user' | 'assistant' | 'tool',
      content: m.content,
      ...(m.toolCallId && { tool_call_id: m.toolCallId }),
      ...(m.toolCalls && {
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        })),
      }),
    }));

    const tools = request.tools?.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      },
    }));

    const response = await this.client.chat.completions.create({
      model: request.model,
      messages: messages as any,
      tools: tools as any,
      tool_choice: request.toolChoice,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens,
      stream: false,
    });

    const choice = response.choices[0];
    const latencyMs = Date.now() - startTime;

    const usage: LLMUsage = {
      promptTokens: response.usage?.prompt_tokens || 0,
      completionTokens: response.usage?.completion_tokens || 0,
      totalTokens: response.usage?.total_tokens || 0,
    };

    const model = this.models.find((m) => m.id === request.model);
    if (model && usage.promptTokens > 0) {
      usage.estimatedCost =
        (usage.promptTokens / 1000) * (model.inputCostPer1kTokens || 0) +
        (usage.completionTokens / 1000) * (model.outputCostPer1kTokens || 0);
    }

    return {
      id: response.id,
      model: response.model,
      content: choice.message.content || '',
      toolCalls: choice.message.tool_calls?.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      })),
      usage,
      finishReason: choice.finish_reason as any,
      latencyMs,
    };
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const input = Array.isArray(request.input) ? request.input : [request.input];

    const response = await this.client.embeddings.create({
      model: request.model,
      input,
    });

    return {
      embeddings: response.data.map((d) => d.embedding),
      model: response.model,
      dimensions: response.data[0]?.embedding.length || 0,
      usage: {
        promptTokens: response.usage.prompt_tokens,
        totalTokens: response.usage.total_tokens,
      },
    };
  }

  async listModels(): Promise<LLMModel[]> {
    return this.models;
  }

  async validateKey(key: string): Promise<boolean> {
    try {
      const client = new OpenAI({ apiKey: key });
      await client.models.list();
      return true;
    } catch {
      return false;
    }
  }
}
