import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _supabase: SupabaseClient | null = null;

export function createSupabaseClient(url: string, anonKey: string): SupabaseClient {
  if (_supabase) return _supabase;
  _supabase = createClient(url, anonKey);
  return _supabase;
}

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    throw new Error('Supabase client not initialized. Call createSupabaseClient() first.');
  }
  return _supabase;
}

export function createSupabaseAdmin(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export interface AuthUser {
  id: string;
  email: string;
  workspaceId: string;
  workspaceRole: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  workspace_id: string;
  workspace_role: string;
  aud: string;
  exp: number;
  iat: number;
  iss: string;
}
