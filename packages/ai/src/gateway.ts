import type {
  LLMProvider,
  LLMModel,
  LLMRequest,
  LLMResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  ProviderConfig,
} from './types.js';
import { OpenAIProvider } from './providers/openai.js';
import { AnthropicProvider } from './providers/anthropic.js';

export class LLMGateway {
  private providers = new Map<string, LLMProvider>();
  private userKeys = new Map<string, Map<string, string>>();

  registerProvider(provider: LLMProvider): void {
    this.providers.set(provider.id, provider);
  }

  setUserKey(userId: string, providerId: string, apiKey: string): void {
    if (!this.userKeys.has(userId)) {
      this.userKeys.set(userId, new Map());
    }
    this.userKeys.get(userId)!.set(providerId, apiKey);
  }

  removeUserKey(userId: string, providerId: string): void {
    this.userKeys.get(userId)?.delete(providerId);
  }

  getUserKey(userId: string, providerId: string): string | undefined {
    return this.userKeys.get(userId)?.get(providerId);
  }

  getProviderForUser(userId: string, providerId: string): LLMProvider | undefined {
    const apiKey = this.getUserKey(userId, providerId);
    if (!apiKey) return undefined;

    const ProviderClass = this.getProviderClass(providerId);
    if (!ProviderClass) return undefined;

    return new ProviderClass({ apiKey });
  }

  private getProviderClass(providerId: string): (new (config: ProviderConfig) => LLMProvider) | undefined {
    switch (providerId) {
      case 'openai':
        return OpenAIProvider;
      case 'anthropic':
        return AnthropicProvider;
      default:
        return undefined;
    }
  }

  async chat(userId: string, providerId: string, request: LLMRequest): Promise<LLMResponse> {
    const provider = this.getProviderForUser(userId, providerId);
    if (!provider) {
      throw new Error(`Provider ${providerId} not configured for user`);
    }
    return provider.chat(request);
  }

  async embed(userId: string, providerId: string, request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const provider = this.getProviderForUser(userId, providerId);
    if (!provider) {
      throw new Error(`Provider ${providerId} not configured for user`);
    }
    if (!provider.embed) {
      throw new Error(`Provider ${providerId} does not support embeddings`);
    }
    return provider.embed(request);
  }

  async listModels(providerId?: string): Promise<LLMModel[]> {
    if (providerId) {
      const provider = this.providers.get(providerId);
      return provider ? await provider.listModels() : [];
    }

    const allModels: LLMModel[] = [];
    for (const provider of this.providers.values()) {
      const models = await provider.listModels();
      allModels.push(...models);
    }
    return allModels;
  }

  async validateKey(providerId: string, apiKey: string): Promise<boolean> {
    const ProviderClass = this.getProviderClass(providerId);
    if (!ProviderClass) return false;

    const provider = new ProviderClass({ apiKey });
    return provider.validateKey(apiKey);
  }

  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}

// Singleton
let gateway: LLMGateway | null = null;

export function getLLMGateway(): LLMGateway {
  if (!gateway) {
    gateway = new LLMGateway();
    
    // Register built-in providers
    // Users provide their own keys at runtime
    gateway.registerProvider(new OpenAIProvider({ apiKey: '' }));
    gateway.registerProvider(new AnthropicProvider({ apiKey: '' }));
  }
  return gateway;
}
