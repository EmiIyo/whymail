import { adminClient, jsonResponse, preflight, requireUser, UnauthorizedError } from '../_shared/http.ts';

interface ResetPayload {
  mailboxId: string;
  newPassword: string;
}

const MIN_PASSWORD_LEN = 8;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const admin = adminClient();

  try {
    const adminUser = await requireUser(req, admin);
    const payload = (await req.json()) as ResetPayload;

    if (!payload?.mailboxId) return jsonResponse({ error: 'mailboxId is required' }, 400);
    const newPassword = (payload.newPassword ?? '').trim();
    if (newPassword.length < MIN_PASSWORD_LEN) {
      return jsonResponse({ error: `Password must be at least ${MIN_PASSWORD_LEN} characters` }, 400);
    }

    // Fetch the mailbox and verify the caller is its admin (creator).
    const mbRes = await admin
      .from('email_accounts')
      .select('id, owner_user_id, created_by_user_id, email')
      .eq('id', payload.mailboxId)
      .maybeSingle();
    if (mbRes.error) throw mbRes.error;
    const mb = mbRes.data;
    if (!mb) return jsonResponse({ error: 'Mailbox not found' }, 404);
    if (mb.created_by_user_id !== adminUser.id) {
      return jsonResponse({ error: 'You do not manage this mailbox' }, 403);
    }
    if (mb.owner_user_id === adminUser.id) {
      // The admin cannot reset their own password through this endpoint —
      // they should use the standard Supabase Auth flow (Settings → Change
      // Password) which requires their current credentials.
      return jsonResponse({ error: 'Use the Settings page to change your own password' }, 400);
    }

    const updated = await admin.auth.admin.updateUserById(mb.owner_user_id, {
      password: newPassword,
    });
    if (updated.error) {
      const msg = updated.error.message ?? 'Failed to update password';
      return jsonResponse({ error: msg }, 400);
    }

    // Force the user to change the password on their next session.
    await admin
      .from('email_accounts')
      .update({ must_change_password: true })
      .eq('id', mb.id);

    return jsonResponse({ ok: true, mailboxId: mb.id, email: mb.email });
  } catch (err) {
    if (err instanceof UnauthorizedError) return jsonResponse({ error: err.message }, 401);
    console.error('reset-mailbox-password error:', err);
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
