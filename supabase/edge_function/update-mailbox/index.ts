import { adminClient, jsonResponse, preflight, requireUser, UnauthorizedError } from '../_shared/http.ts';

interface UpdateMailboxPayload {
  mailboxId: string;
  displayName?: string | null;   // null => clear
  enabled?: boolean;
  recoveryEmail?: string | null; // null => clear
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const admin = adminClient();
  try {
    const adminUser = await requireUser(req, admin);
    const payload = (await req.json()) as UpdateMailboxPayload;
    if (!payload?.mailboxId) return jsonResponse({ error: 'mailboxId is required' }, 400);

    const mbRes = await admin
      .from('email_accounts')
      .select('id, owner_user_id, created_by_user_id')
      .eq('id', payload.mailboxId)
      .maybeSingle();
    if (mbRes.error) throw mbRes.error;
    const mb = mbRes.data;
    if (!mb) return jsonResponse({ error: 'Mailbox not found' }, 404);

    // Both the admin who created the mailbox AND the owner can update it.
    const isCreator = mb.created_by_user_id === adminUser.id;
    const isOwner = mb.owner_user_id === adminUser.id;
    if (!isCreator && !isOwner) {
      return jsonResponse({ error: 'You do not have access to this mailbox' }, 403);
    }

    const update: Record<string, unknown> = {};
    if (payload.displayName !== undefined) {
      const dn = payload.displayName === null ? null : payload.displayName.trim() || null;
      update.display_name = dn;
    }
    // Only the creator (admin) can disable a mailbox; owners shouldn't lock themselves out.
    if (payload.enabled !== undefined) {
      if (!isCreator) return jsonResponse({ error: 'Only the mailbox admin can change the enabled state' }, 403);
      update.enabled = payload.enabled;
    }
    if (payload.recoveryEmail !== undefined) {
      if (payload.recoveryEmail === null) {
        update.recovery_email = null;
      } else {
        const candidate = payload.recoveryEmail.trim().toLowerCase();
        if (candidate && !EMAIL_RE.test(candidate)) {
          return jsonResponse({ error: 'Invalid recovery email format' }, 400);
        }
        update.recovery_email = candidate || null;
      }
    }
    if (Object.keys(update).length === 0) {
      return jsonResponse({ error: 'No updatable fields supplied' }, 400);
    }

    const updated = await admin
      .from('email_accounts')
      .update(update)
      .eq('id', mb.id)
      .select('id, owner_user_id, created_by_user_id, domain_id, email, display_name, enabled, must_change_password, recovery_email, storage_used_mb, storage_quota_mb, last_activity_at, created_at')
      .single();
    if (updated.error) throw updated.error;

    return jsonResponse({ mailbox: updated.data });
  } catch (err) {
    if (err instanceof UnauthorizedError) return jsonResponse({ error: err.message }, 401);
    console.error('update-mailbox error:', err);
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
