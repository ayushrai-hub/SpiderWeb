import { createCipheriv, createDecipheriv, randomBytes, scryptSync, createHash } from 'crypto';
import { getSupabase } from '@intel/shared';
import { getLLMGateway } from './gateway.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 32;

function getEncryptionKey(): Buffer {
  const key = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY environment variable is required');
  }
  return Buffer.from(key, 'hex');
}

export interface EncryptedCredential {
  id: string;
  workspaceId: string;
  userId: string;
  provider: string;
  encryptedKey: string;
  iv: string;
  authTag: string;
  salt: string;
  keyFingerprint: string;
  status: 'active' | 'expired' | 'revoked';
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CredentialMetadata {
  id: string;
  provider: string;
  keyFingerprint: string;
  status: string;
  lastUsedAt?: Date;
  createdAt: Date;
}

function encrypt(plaintext: string, key: Buffer): { encrypted: string; iv: string; authTag: string; salt: string } {
  const salt = randomBytes(SALT_LENGTH);
  const derivedKey = scryptSync(key, salt, 32);
  const iv = randomBytes(IV_LENGTH);
  
  const cipher = createCipheriv(ALGORITHM, derivedKey, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    salt: salt.toString('hex'),
  };
}

function decrypt(encryptedData: string, iv: string, authTag: string, salt: string, key: Buffer): string {
  const derivedKey = scryptSync(key, Buffer.from(salt, 'hex'), 32);
  const decipher = createDecipheriv(ALGORITHM, derivedKey, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function generateFingerprint(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex').substring(0, 16);
}

export async function storeCredential(
  workspaceId: string,
  userId: string,
  provider: string,
  apiKey: string
): Promise<CredentialMetadata> {
  const encryptionKey = getEncryptionKey();
  const { encrypted, iv, authTag, salt } = encrypt(apiKey, encryptionKey);
  const keyFingerprint = generateFingerprint(apiKey);

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('user_credentials')
    .upsert({
      workspace_id: workspaceId,
      user_id: userId,
      provider,
      encrypted_key: encrypted,
      iv,
      auth_tag: authTag,
      salt,
      key_fingerprint: keyFingerprint,
      status: 'active',
    }, {
      onConflict: 'workspace_id,user_id,provider',
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to store credential: ${error.message}`);

  return {
    id: data.id,
    provider: data.provider,
    keyFingerprint: data.key_fingerprint,
    status: data.status,
    createdAt: new Date(data.created_at),
  };
}

export async function retrieveCredential(
  workspaceId: string,
  userId: string,
  provider: string
): Promise<string | null> {
  const encryptionKey = getEncryptionKey();
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('user_credentials')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .eq('provider', provider)
    .eq('status', 'active')
    .single();

  if (error || !data) return null;

  // Update last used
  await supabase
    .from('user_credentials')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id);

  return decrypt(data.encrypted_key, data.iv, data.auth_tag, data.salt, encryptionKey);
}

export async function listCredentials(
  workspaceId: string,
  userId: string
): Promise<CredentialMetadata[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('user_credentials')
    .select('id, provider, key_fingerprint, status, last_used_at, created_at')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to list credentials: ${error.message}`);

  return (data || []).map((d) => ({
    id: d.id,
    provider: d.provider,
    keyFingerprint: d.key_fingerprint,
    status: d.status,
    lastUsedAt: d.last_used_at ? new Date(d.last_used_at) : undefined,
    createdAt: new Date(d.created_at),
  }));
}

export async function deleteCredential(
  workspaceId: string,
  userId: string,
  credentialId: string
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('user_credentials')
    .delete()
    .eq('id', credentialId)
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId);

  if (error) throw new Error(`Failed to delete credential: ${error.message}`);
}

export async function testCredential(
  workspaceId: string,
  userId: string,
  provider: string
): Promise<boolean> {
  const apiKey = await retrieveCredential(workspaceId, userId, provider);
  if (!apiKey) return false;

  const gateway = getLLMGateway();
  return gateway.validateKey(provider, apiKey);
}
