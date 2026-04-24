import { adminClient, jsonResponse, preflight, requireUser, UnauthorizedError } from '../_shared/http.ts';
import { encryptSecret } from '../_shared/crypto.ts';

interface SaveAccountPayload {
  id?: string;
  email: string;
  displayName?: string | null;
  domainId?: string | null;
  imapHost?: string | null;
  imapPort?: number | null;
  imapSecure?: boolean | null;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpSecure?: boolean | null;
  username?: string | null;
  password?: string | null;
}

function clean<T>(v: T | null | undefined): T | null {
  if (v === undefined) return null;
  if (typeof v === 'string' && v.trim() === '') return null;
  return v as T;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const admin = adminClient();

  try {
    const user = await requireUser(req, admin);
    const payload = (await req.json()) as SaveAccountPayload;

    if (!payload?.email || typeof payload.email !== 'string') {
      return jsonResponse({ error: 'email is required' }, 400);
    }

    const row: Record<string, unknown> = {
      user_id: user.id,
      email: payload.email.trim().toLowerCase(),
      display_name: clean(payload.displayName),
      domain_id: clean(payload.domainId),
      imap_host: clean(payload.imapHost),
      imap_port: payload.imapPort ?? undefined,
      imap_secure: payload.imapSecure ?? undefined,
      smtp_host: clean(payload.smtpHost),
      smtp_port: payload.smtpPort ?? undefined,
      smtp_secure: payload.smtpSecure ?? undefined,
      username: clean(payload.username),
    };

    // Only encrypt & update the password when a non-empty value is supplied.
    if (payload.password && payload.password.length > 0) {
      row.password_encrypted = await encryptSecret(admin, payload.password);
    }

    // Strip undefined values so partial updates stay partial.
    for (const k of Object.keys(row)) {
      if (row[k] === undefined) delete row[k];
    }

    if (payload.id) {
      // Ownership check then update
      const existing = await admin
        .from('email_accounts')
        .select('id, user_id')
        .eq('id', payload.id)
        .maybeSingle();
      if (existing.error) throw existing.error;
      if (!existing.data || existing.data.user_id !== user.id) {
        return jsonResponse({ error: 'Account not found' }, 404);
      }
      const { data, error } = await admin
        .from('email_accounts')
        .update(row)
        .eq('id', payload.id)
        .select('id, email, display_name, domain_id, imap_host, imap_port, smtp_host, smtp_port, username, enabled, storage_used_mb, storage_quota_mb, last_synced_at, created_at')
        .single();
      if (error) throw error;
      return jsonResponse({ account: data });
    }

    const { data, error } = await admin
      .from('email_accounts')
      .insert(row)
      .select('id, email, display_name, domain_id, imap_host, imap_port, smtp_host, smtp_port, username, enabled, storage_used_mb, storage_quota_mb, last_synced_at, created_at')
      .single();
    if (error) throw error;
    return jsonResponse({ account: data });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, 401);
    }
    console.error('save-account error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonResponse({ error: message }, 500);
  }
});
