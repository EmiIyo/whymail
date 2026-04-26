import { adminClient, jsonResponse, preflight, requireUser, UnauthorizedError } from '../_shared/http.ts';

// Called by the user immediately after they change their password via
// supabase.auth.updateUser(). Clears must_change_password on every mailbox
// they own so the gate stops redirecting them. We can't use a DB trigger
// because RLS on email_accounts denies all client-side writes.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const admin = adminClient();
  try {
    const user = await requireUser(req, admin);
    const { error } = await admin
      .from('email_accounts')
      .update({ must_change_password: false })
      .eq('owner_user_id', user.id)
      .eq('must_change_password', true);
    if (error) throw error;
    return jsonResponse({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) return jsonResponse({ error: err.message }, 401);
    console.error('confirm-password-change error:', err);
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
