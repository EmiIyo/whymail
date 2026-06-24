import { adminClient, jsonResponse, preflight } from '../_shared/http.ts';
import { sendViaCloudflare, getCloudflareEmailCreds } from '../_shared/cf-email.ts';

interface RequestPayload { email: string; redirectUrl: string; }
const TOKEN_TTL_MIN = 30;

function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Public endpoint (verify_jwt: false) — anyone can call it with a mailbox
// address. We always return 200 to avoid leaking whether an address exists,
// but only generate + email a reset link when the mailbox exists AND has a
// recovery_email configured. For plain Supabase users (no hosted mailbox row),
// we fall through to Supabase's native password recovery email.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  const admin = adminClient();
  try {
    const { email, redirectUrl } = (await req.json()) as RequestPayload;
    if (!email || typeof email !== 'string') return jsonResponse({ ok: true });
    if (!redirectUrl || typeof redirectUrl !== 'string') return jsonResponse({ error: 'redirectUrl required' }, 400);

    const target = email.trim().toLowerCase();

    // Path A: Hosted mailbox — deliver our own one-time token to recovery_email
    // via Cloudflare Email Sending.
    const mbRes = await admin
      .from('email_accounts')
      .select('id, owner_user_id, recovery_email, enabled, email')
      .eq('email', target)
      .maybeSingle();
    if (mbRes.error) throw mbRes.error;
    const mb = mbRes.data;

    if (mb && mb.enabled !== false && mb.recovery_email) {
      const token = generateToken();
      const expiresAt = new Date(Date.now() + TOKEN_TTL_MIN * 60_000).toISOString();
      const insertRes = await admin.from('password_reset_tokens').insert({
        token, user_id: mb.owner_user_id, mailbox_id: mb.id, recovery_email: mb.recovery_email, expires_at: expiresAt,
      });
      if (insertRes.error) throw insertRes.error;

      const link = `${redirectUrl}${redirectUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
      const subject = `Reset your WhyMail password for ${mb.email}`;
      const text = [
        `Someone requested a password reset for your WhyMail mailbox ${mb.email}.`,
        '',
        'Open the link below to choose a new password:',
        link,
        '',
        `This link expires in ${TOKEN_TTL_MIN} minutes and can be used only once.`,
        '',
        "If you didn't ask for this, just ignore this email.",
      ].join('\n');
      const html = `<p>Someone requested a password reset for your WhyMail mailbox <strong>${mb.email}</strong>.</p><p><a href="${link}">Reset my password</a></p><p style="color:#666;font-size:12px;">This link expires in ${TOKEN_TTL_MIN} minutes and can be used only once. If you didn't ask for this, just ignore this email.</p>`;

      try {
        const creds = await getCloudflareEmailCreds(admin);
        if (!creds.accountId || !creds.token) {
          console.error('CF Email Sending not configured — password reset cannot send');
          return jsonResponse({ ok: true });
        }
        await sendViaCloudflare({
          accountId: creds.accountId,
          token: creds.token,
          from: mb.email as string,
          fromName: 'WhyMail',
          to: [mb.recovery_email as string],
          subject, text, html,
        });
      } catch (sendErr) {
        console.error('password-reset send failed:', sendErr);
      }
      return jsonResponse({ ok: true });
    }

    // Path B: Plain auth user — Supabase native recovery to user's own auth email.
    const { error: nativeErr } = await admin.auth.resetPasswordForEmail(target, { redirectTo: redirectUrl });
    if (nativeErr) {
      console.warn('native resetPasswordForEmail returned error (silently):', nativeErr.message);
    }
    return jsonResponse({ ok: true });
  } catch (err) {
    console.error('request-password-reset error:', err);
    return jsonResponse({ ok: true });
  }
});
