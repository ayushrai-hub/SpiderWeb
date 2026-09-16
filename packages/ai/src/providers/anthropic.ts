import Anthropic from '@anthropic-ai/sdk';
import type {
  LLMProvider,
  LLMModel,
  LLMRequest,
  LLMResponse,
  LLMUsage,
  ProviderConfig,
} from '../types.js';

const ANTHROPIC_MODELS: LLMModel[] = [
  {
    id: 'claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutput: 64000,
    supportsStreaming: true,
    supportsTools: true,
    supportsImages: true,
    inputCostPer1kTokens: 0.003,
    outputCostPer1kTokens: 0.015,
  },
  {
    id: 'claude-3-5-sonnet-20241022',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutput: 8192,
    supportsStreaming: true,
    supportsTools: true,
    supportsImages: true,
    inputCostPer1kTokens: 0.003,
    outputCostPer1kTokens: 0.015,
  },
  {
    id: 'claude-3-haiku-20240307',
    name: 'Claude 3 Haiku',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutput: 4096,
    supportsStreaming: true,
    supportsTools: true,
    supportsImages: true,
    inputCostPer1kTokens: 0.00025,
    outputCostPer1kTokens: 0.00125,
  },
];

export class AnthropicProvider implements LLMProvider {
  id = 'anthropic';
  name = 'Anthropic';
  models = ANTHROPIC_MODELS;
  private client: Anthropic;
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      maxRetries: config.maxRetries || 3,
      timeout: config.timeout || 60000,
    });
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();

    // Extract system message
    const systemMessage = request.messages.find((m) => m.role === 'system');
    const nonSystemMessages = request.messages.filter((m) => m.role !== 'system');

    const messages = nonSystemMessages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const tools = request.tools?.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }));

    const response = await this.client.messages.create({
      model: request.model,
      max_tokens: request.maxTokens || 4096,
      system: systemMessage?.content,
      messages: messages as any,
      tools: tools as any,
      temperature: request.temperature ?? 0.7,
    });

    const latencyMs = Date.now() - startTime;

    let content = '';
    const toolCalls: LLMResponse['toolCalls'] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        content += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          type: 'function',
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input),
          },
        });
      }
    }

    const usage: LLMUsage = {
      promptTokens: response.usage.input_tokens,
      completionTokens: response.usage.output_tokens,
      totalTokens: response.usage.input_tokens + response.usage.output_tokens,
    };

    const model = this.models.find((m) => m.id === request.model);
    if (model) {
      usage.estimatedCost =
        (usage.promptTokens / 1000) * (model.inputCostPer1kTokens || 0) +
        (usage.completionTokens / 1000) * (model.outputCostPer1kTokens || 0);
    }

    return {
      id: response.id,
      model: response.model,
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage,
      finishReason: response.stop_reason === 'end_turn' ? 'stop' : response.stop_reason === 'tool_use' ? 'tool_calls' : 'stop',
      latencyMs,
    };
  }

  async listModels(): Promise<LLMModel[]> {
    return this.models;
  }

  async validateKey(key: string): Promise<boolean> {
    try {
      const client = new Anthropic({ apiKey: key });
      await client.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      });
      return true;
    } catch {
      return false;
    }
  }
}
