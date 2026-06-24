import { adminClient, jsonResponse, preflight, requireUser, UnauthorizedError } from '../_shared/http.ts';
import { sendViaCloudflare, getCloudflareEmailCreds } from '../_shared/cf-email.ts';

interface Payload { userId: string; redirectUrl: string; }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  const admin = adminClient();
  try {
    const caller = await requireUser(req, admin);
    const { userId, redirectUrl } = (await req.json()) as Payload;
    if (!userId) return jsonResponse({ error: 'userId is required' }, 400);
    if (!redirectUrl) return jsonResponse({ error: 'redirectUrl is required' }, 400);

    const { data: isSuper, error: superErr } = await admin.rpc('is_super_admin', { p_user_id: caller.id });
    if (superErr) throw superErr;
    if (!isSuper) return jsonResponse({ error: 'Super admin access required' }, 403);

    const { data: u, error: uErr } = await admin.auth.admin.getUserById(userId);
    if (uErr || !u?.user?.email) return jsonResponse({ error: 'User not found' }, 404);
    const targetEmail = u.user.email;

    const mbRes = await admin.from('email_accounts').select('id, owner_user_id, recovery_email, enabled, email').eq('email', targetEmail.toLowerCase()).maybeSingle();
    if (mbRes.error) throw mbRes.error;
    const mb = mbRes.data;

    if (mb && mb.enabled !== false && mb.recovery_email) {
      const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
      const token = Array.from(tokenBytes).map((b) => b.toString(16).padStart(2, '0')).join('');
      const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
      const insertRes = await admin.from('password_reset_tokens').insert({
        token, user_id: mb.owner_user_id, mailbox_id: mb.id, recovery_email: mb.recovery_email, expires_at: expiresAt,
      });
      if (insertRes.error) throw insertRes.error;

      const link = `${redirectUrl}${redirectUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
      const subject = `Reset your WhyMail password for ${mb.email}`;
      const text = `Your administrator triggered a password reset.\nOpen this link to choose a new password (valid 30 minutes):\n${link}`;
      const html = `<p>Your administrator triggered a password reset.</p><p><a href="${link}">Reset my password</a></p><p style="color:#666;font-size:12px;">Valid for 30 minutes, single use.</p>`;

      try {
        const creds = await getCloudflareEmailCreds(admin);
        if (creds.accountId && creds.token) {
          await sendViaCloudflare({
            accountId: creds.accountId,
            token: creds.token,
            from: mb.email as string,
            fromName: 'WhyMail',
            to: [mb.recovery_email as string],
            subject, text, html,
          });
        } else {
          console.error('CF Email Sending not configured — admin reset email skipped');
        }
      } catch (sendErr) {
        console.error('admin-reset send failed:', sendErr);
      }
      return jsonResponse({ ok: true, mode: 'mailbox', provider: 'cloudflare', sentTo: mb.recovery_email });
    }

    const { error: nativeErr } = await admin.auth.resetPasswordForEmail(targetEmail, { redirectTo: redirectUrl });
    if (nativeErr) return jsonResponse({ error: nativeErr.message }, 500);
    return jsonResponse({ ok: true, mode: 'native', sentTo: targetEmail });
  } catch (err) {
    if (err instanceof UnauthorizedError) return jsonResponse({ error: err.message }, 401);
    console.error('admin-reset-user-password error:', err);
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
