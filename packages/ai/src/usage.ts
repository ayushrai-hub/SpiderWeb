import { getSupabase } from '@intel/shared';
import type { UsageRecord, UsageLimits } from './types.js';

export async function trackUsage(record: Omit<UsageRecord, 'id' | 'createdAt'>): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('ai_usage')
    .insert({
      workspace_id: record.workspaceId,
      user_id: record.userId,
      provider: record.provider,
      model: record.model,
      prompt_tokens: record.promptTokens,
      completion_tokens: record.completionTokens,
      total_tokens: record.totalTokens,
      estimated_cost: record.estimatedCost,
      latency_ms: record.latencyMs,
      feature: record.feature,
    });

  if (error) {
    console.error('Failed to track usage:', error.message);
  }
}

export async function getUsageLimits(
  workspaceId: string,
  userId: string
): Promise<UsageLimits> {
  const supabase = getSupabase();
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [dailyResult, monthlyResult] = await Promise.all([
    supabase
      .from('ai_usage')
      .select('total_tokens, estimated_cost')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .gte('created_at', startOfDay.toISOString()),
    supabase
      .from('ai_usage')
      .select('total_tokens, estimated_cost')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .gte('created_at', startOfMonth.toISOString()),
  ]);

  const dailyUsed = dailyResult.data?.reduce((sum, r) => sum + (r.estimated_cost || 0), 0) || 0;
  const monthlyUsed = monthlyResult.data?.reduce((sum, r) => sum + (r.estimated_cost || 0), 0) || 0;

  return {
    dailyLimit: 10.00,
    monthlyLimit: 100.00,
    dailyUsed,
    monthlyUsed,
  };
}

export async function getUsageHistory(
  workspaceId: string,
  userId: string,
  days: number = 30
): Promise<UsageRecord[]> {
  const supabase = getSupabase();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data, error } = await supabase
    .from('ai_usage')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to get usage history: ${error.message}`);

  return (data || []).map((d) => ({
    id: d.id,
    workspaceId: d.workspace_id,
    userId: d.user_id,
    provider: d.provider,
    model: d.model,
    promptTokens: d.prompt_tokens,
    completionTokens: d.completion_tokens,
    totalTokens: d.total_tokens,
    estimatedCost: d.estimated_cost,
    latencyMs: d.latency_ms,
    feature: d.feature,
    createdAt: new Date(d.created_at),
  }));
}
