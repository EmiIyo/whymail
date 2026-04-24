// AES-GCM 256-bit symmetric encryption for IMAP/SMTP credential storage.
//
// The encryption key is a random 32-byte value stored in the `app_secrets`
// table under the name `credential_key`. RLS on that table denies all access
// except for the service_role (which bypasses RLS) so the key is only ever
// visible to trusted edge functions. On first invocation the key is generated
// and persisted; subsequent invocations load it from the database.
//
// Ciphertext layout (base64): IV (12 bytes) || ciphertext+AuthTag
// If the key row is ever deleted, previously-stored credentials become
// unrecoverable and users must re-enter their IMAP/SMTP passwords.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const KEY_NAME = 'credential_key';
const IV_LENGTH = 12;

let cachedKey: CryptoKey | null = null;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function loadOrCreateRawKey(admin: SupabaseClient): Promise<Uint8Array> {
  const existing = await admin
    .from('app_secrets')
    .select('value')
    .eq('name', KEY_NAME)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.value) return fromBase64(existing.data.value);

  const fresh = crypto.getRandomValues(new Uint8Array(32));
  const insert = await admin
    .from('app_secrets')
    .insert({ name: KEY_NAME, value: toBase64(fresh) });
  if (insert.error) {
    // If another invocation raced us, re-read the row.
    const retry = await admin
      .from('app_secrets')
      .select('value')
      .eq('name', KEY_NAME)
      .maybeSingle();
    if (retry.error || !retry.data?.value) throw insert.error;
    return fromBase64(retry.data.value);
  }
  return fresh;
}

async function getKey(admin: SupabaseClient): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const raw = await loadOrCreateRawKey(admin);
  cachedKey = await crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
  return cachedKey;
}

export async function encryptSecret(admin: SupabaseClient, plaintext: string): Promise<string> {
  const key = await getKey(admin);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(plaintext),
    ),
  );
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv, 0);
  combined.set(ciphertext, iv.length);
  return toBase64(combined);
}

export async function decryptSecret(admin: SupabaseClient, payload: string): Promise<string> {
  const key = await getKey(admin);
  const combined = fromBase64(payload);
  if (combined.length < IV_LENGTH + 16) {
    throw new Error('Ciphertext too short');
  }
  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(plain);
}
