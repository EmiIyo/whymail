import { adminClient, jsonResponse, preflight } from '../_shared/http.ts';

// Public endpoint (verify_jwt: false). Consumes a one-time reset token issued
// by request-password-reset and sets the user's password to the supplied
// value via the admin API.

interface ConfirmPayload {
  token: string;
  newPassword: string;
}

const MIN_PASSWORD_LEN = 8;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const admin = adminClient();

  try {
    const { token, newPassword } = (await req.json()) as ConfirmPayload;
    if (!token) return jsonResponse({ error: 'token is required' }, 400);
    const password = (newPassword ?? '').trim();
    if (password.length < MIN_PASSWORD_LEN) {
      return jsonResponse({ error: `Password must be at least ${MIN_PASSWORD_LEN} characters` }, 400);
    }

    const tokenRes = await admin
      .from('password_reset_tokens')
      .select('token, user_id, mailbox_id, expires_at, used_at')
      .eq('token', token)
      .maybeSingle();
    if (tokenRes.error) throw tokenRes.error;
    const row = tokenRes.data;
    if (!row) return jsonResponse({ error: 'Invalid or expired link' }, 400);
    if (row.used_at) return jsonResponse({ error: 'This link was already used' }, 400);
    if (new Date(row.expires_at as string).getTime() < Date.now()) {
      return jsonResponse({ error: 'This link has expired. Request a new one.' }, 400);
    }

    const updated = await admin.auth.admin.updateUserById(row.user_id as string, {
      password,
    });
    if (updated.error) {
      const msg = updated.error.message ?? 'Failed to update password';
      return jsonResponse({ error: msg }, 400);
    }

    // Mark the token used so it can't be replayed.
    await admin
      .from('password_reset_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('token', token);

    // Also clear must_change_password since the user just set their own password.
    await admin
      .from('email_accounts')
      .update({ must_change_password: false })
      .eq('id', row.mailbox_id);

    // Best-effort cleanup of expired tokens for this user.
    await admin
      .from('password_reset_tokens')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .eq('user_id', row.user_id);

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error('confirm-password-reset error:', err);
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
