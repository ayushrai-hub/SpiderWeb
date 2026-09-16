import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.js';
import { getAvailableTools, executeTool, buildSystemPrompt } from '../../services/ai-chat.js';
import { getLLMGateway, trackUsage } from '@intel/ai';
import { retrieveCredential } from '@intel/ai';
import { logAuditEvent } from '../../services/audit.js';

const chatMessageSchema = z.object({
  message: z.string().min(1),
  provider: z.string().default('openai'),
  model: z.string().default('gpt-4o-mini'),
  conversationId: z.string().uuid().optional(),
});

export async function aiChatRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.post('/api/v1/ai/chat', async (request, reply) => {
    const workspaceId = request.user.workspaceId;
    const userId = request.user.id;
    const body = chatMessageSchema.parse(request.body);

    try {
      // Get user's API key
      const apiKey = await retrieveCredential(workspaceId, userId, body.provider);
      if (!apiKey) {
        return reply.status(400).send({
          error: {
            code: 'NO_CREDENTIAL',
            message: `No ${body.provider} API key configured. Add one in Settings > AI.`,
          },
        });
      }

      // Initialize provider with user's key
      const gateway = getLLMGateway();
      gateway.setUserKey(userId, body.provider, apiKey);

      // Get tools
      const tools = getAvailableTools();
      const llmTools = tools.map((t) => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));

      // Build messages
      const systemPrompt = buildSystemPrompt(workspaceId);
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: body.message },
      ];

      // Call LLM
      const response = await gateway.chat(userId, body.provider, {
        model: body.model,
        messages,
        tools: llmTools,
        temperature: 0.7,
        maxTokens: 4096,
      });

      // Track usage
      await trackUsage({
        workspaceId,
        userId,
        provider: body.provider,
        model: body.model,
        promptTokens: response.usage.promptTokens,
        completionTokens: response.usage.completionTokens,
        totalTokens: response.usage.totalTokens,
        estimatedCost: response.usage.estimatedCost || 0,
        latencyMs: response.latencyMs,
        feature: 'chat',
      });

      // Handle tool calls
      if (response.toolCalls && response.toolCalls.length > 0) {
        const toolResults: any[] = [];
        
        for (const toolCall of response.toolCalls) {
          try {
            const params = JSON.parse(toolCall.function.arguments);
            const result = await executeTool(toolCall.function.name, params, workspaceId);
            toolResults.push({
              toolCallId: toolCall.id,
              result,
            });
          } catch (err) {
            const error = err as Error;
            toolResults.push({
              toolCallId: toolCall.id,
              error: error.message,
            });
          }
        }

        // Add tool results to messages and call LLM again
        const followUpMessages = [
          ...messages,
          {
            role: 'assistant' as const,
            content: response.content,
            toolCalls: response.toolCalls,
          },
          ...toolResults.map((tr) => ({
            role: 'tool' as const,
            content: JSON.stringify(tr.result || tr.error),
            toolCallId: tr.toolCallId,
          })),
        ];

        const followUpResponse = await gateway.chat(userId, body.provider, {
          model: body.model,
          messages: followUpMessages,
          temperature: 0.7,
          maxTokens: 4096,
        });

        await trackUsage({
          workspaceId,
          userId,
          provider: body.provider,
          model: body.model,
          promptTokens: followUpResponse.usage.promptTokens,
          completionTokens: followUpResponse.usage.completionTokens,
          totalTokens: followUpResponse.usage.totalTokens,
          estimatedCost: followUpResponse.usage.estimatedCost || 0,
          latencyMs: followUpResponse.latencyMs,
          feature: 'chat',
        });

        return reply.send({
          data: {
            role: 'assistant',
            content: followUpResponse.content,
            toolResults,
            usage: followUpResponse.usage,
          },
        });
      }

      await logAuditEvent({
        workspaceId,
        userId,
        action: 'ai.chat',
        resource: 'ai',
        metadata: { provider: body.provider, model: body.model },
      });

      return reply.send({
        data: {
          role: 'assistant',
          content: response.content,
          usage: response.usage,
        },
      });
    } catch (err) {
      const error = err as Error;
      return reply.status(500).send({
        error: { code: 'CHAT_FAILED', message: error.message },
      });
    }
  });

  app.get('/api/v1/ai/tools', async (_request, reply) => {
    const tools = getAvailableTools();
    return reply.send({
      data: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    });
  });
}
