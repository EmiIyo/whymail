import { adminClient, jsonResponse, preflight } from '../_shared/http.ts';

interface Payload {
  recoveryEmail: string;
  inviteCode: string;
  newPassword: string;
}

const INVITE_CODE = 'linuxlin';
const MIN_PASSWORD_LEN = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const admin = adminClient();
  try {
    const payload = (await req.json()) as Payload;
    const recoveryEmail = (payload.recoveryEmail ?? '').trim().toLowerCase();
    // Aggressively normalize the invite code: drop any non-alphanumeric chars
    // (handles invisible whitespace, NBSP, leading/trailing dots from copy-paste).
    const rawInvite = (payload.inviteCode ?? '').trim();
    const inviteCode = rawInvite.toLowerCase().replace(/[^a-z0-9]/g, '');
    const expectedCode = INVITE_CODE.toLowerCase().replace(/[^a-z0-9]/g, '');
    const newPassword = payload.newPassword ?? '';

    // Diagnostic logging (visible only in Supabase function logs, not to client).
    console.log('signup-redeem attempt:', JSON.stringify({
      recoveryEmail,
      inviteCodeRaw: rawInvite,
      inviteCodeNormalized: inviteCode,
      inviteCodeBytes: Array.from(rawInvite).map((c) => c.charCodeAt(0)),
      passwordLen: newPassword.length,
    }));

    if (!EMAIL_RE.test(recoveryEmail)) return jsonResponse({ error: 'Invalid email format' }, 400);
    if (inviteCode !== expectedCode) {
      return jsonResponse({ error: `Wrong invite code (got "${rawInvite}"). Ask your admin for the correct one.` }, 400);
    }
    if (newPassword.length < MIN_PASSWORD_LEN) {
      return jsonResponse({ error: `Password must be at least ${MIN_PASSWORD_LEN} characters (got ${newPassword.length})` }, 400);
    }

    // Look up pending mailboxes for this recovery email. must_change_password=true
    // means the user has not yet set their own password — this gates the redemption
    // so a leaked invite code can never reset an already-activated user's password.
    const accountsRes = await admin
      .from('email_accounts')
      .select('id, owner_user_id, must_change_password, recovery_email')
      .ilike('recovery_email', recoveryEmail);
    if (accountsRes.error) throw accountsRes.error;
    const allMatching = accountsRes.data ?? [];
    if (allMatching.length === 0) {
      return jsonResponse({ error: 'No mailbox is set up for this email. Double-check the email your admin gave you, or ask them to add you.' }, 404);
    }
    const pending = allMatching.filter((r) => r.must_change_password === true);
    if (pending.length === 0) {
      return jsonResponse({ error: 'This account is already activated. Use Sign in instead of Sign up.' }, 409);
    }

    // All pending mailboxes for the same recovery_email must share one owner_user_id
    // (create-mailbox enforces this by attaching to existing user when one exists).
    const ownerIds = Array.from(new Set(pending.map((r) => r.owner_user_id as string)));
    if (ownerIds.length !== 1) {
      console.error('signup-redeem: inconsistent owner_user_id for recovery_email', recoveryEmail, ownerIds);
      return jsonResponse({ error: 'Account in inconsistent state. Contact support.' }, 500);
    }
    const ownerUserId = ownerIds[0];

    // Verify the auth user's current email matches the recovery_email — defensive
    // check to make sure we don't update the wrong user.
    const userRes = await admin.auth.admin.getUserById(ownerUserId);
    if (userRes.error || !userRes.data?.user) {
      return jsonResponse({ error: 'Account not found' }, 404);
    }
    if ((userRes.data.user.email ?? '').toLowerCase() !== recoveryEmail) {
      console.error('signup-redeem: auth user email mismatch', ownerUserId, userRes.data.user.email, recoveryEmail);
      return jsonResponse({ error: 'Account email mismatch. Contact support.' }, 500);
    }

    // Set the user's password.
    const updRes = await admin.auth.admin.updateUserById(ownerUserId, {
      password: newPassword,
      email_confirm: true,
    });
    if (updRes.error) {
      return jsonResponse({ error: updRes.error.message }, 400);
    }

    // Flip must_change_password=false on every mailbox owned by this user, so a
    // future signup-redeem call rejects with "already activated".
    const flipRes = await admin
      .from('email_accounts')
      .update({ must_change_password: false })
      .eq('owner_user_id', ownerUserId);
    if (flipRes.error) throw flipRes.error;

    return jsonResponse({ ok: true, email: recoveryEmail });
  } catch (err) {
    console.error('signup-redeem error:', err);
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
