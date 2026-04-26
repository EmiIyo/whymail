import { adminClient, jsonResponse, preflight } from '../_shared/http.ts';

// Public endpoint (verify_jwt: false) — anyone can call it with a mailbox
// address. We always return 200 to avoid leaking whether an address exists,
// but only generate + email a reset link when the mailbox exists AND has a
// recovery email configured.

interface RequestPayload {
  email: string;        // mailbox address e.g. "john@petbook.cc"
  redirectUrl: string;  // e.g. "https://app/#/reset-password" — token will be appended
}

const TOKEN_TTL_MIN = 30;

function generateToken(): string {
  // 32 random bytes -> 64 hex chars; sufficient for a single-use, time-bound token
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function getResendApiKey(admin: ReturnType<typeof adminClient>): Promise<string | null> {
  const { data } = await admin.from('app_secrets').select('value').eq('name', 'resend_api_key').maybeSingle();
  return (data?.value as string | undefined) ?? null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const admin = adminClient();

  try {
    const { email, redirectUrl } = (await req.json()) as RequestPayload;
    if (!email || typeof email !== 'string') return jsonResponse({ ok: true });
    if (!redirectUrl || typeof redirectUrl !== 'string') return jsonResponse({ error: 'redirectUrl required' }, 400);

    const target = email.trim().toLowerCase();

    const mbRes = await admin
      .from('email_accounts')
      .select('id, owner_user_id, recovery_email, enabled, email')
      .eq('email', target)
      .maybeSingle();
    if (mbRes.error) throw mbRes.error;
    const mb = mbRes.data;

    // Always 200 to avoid enumeration. Only side-effect when valid.
    if (!mb || mb.enabled === false || !mb.recovery_email) {
      return jsonResponse({ ok: true });
    }

    const token = generateToken();
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MIN * 60_000).toISOString();
    const insertRes = await admin.from('password_reset_tokens').insert({
      token,
      user_id: mb.owner_user_id,
      mailbox_id: mb.id,
      recovery_email: mb.recovery_email,
      expires_at: expiresAt,
    });
    if (insertRes.error) throw insertRes.error;

    const apiKey = await getResendApiKey(admin);
    if (!apiKey) {
      console.error('Resend API key missing — cannot send recovery email');
      return jsonResponse({ ok: true });
    }

    const link = `${redirectUrl}${redirectUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
    const subject = `Reset your WhyMail password for ${mb.email}`;
    const text = [
      `Someone requested a password reset for your WhyMail mailbox ${mb.email}.`,
      ``,
      `Open the link below to choose a new password:`,
      link,
      ``,
      `This link expires in ${TOKEN_TTL_MIN} minutes and can be used only once.`,
      ``,
      `If you didn't ask for this, just ignore this email.`,
    ].join('\n');
    const html = `
      <p>Someone requested a password reset for your WhyMail mailbox <strong>${mb.email}</strong>.</p>
      <p><a href="${link}">Reset my password</a></p>
      <p style="color:#666;font-size:12px;">This link expires in ${TOKEN_TTL_MIN} minutes and can be used only once. If you didn't ask for this, just ignore this email.</p>
    `;

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Use the user's own mailbox as the "from" so the recovery email
        // arrives looking like it came from their account on our system.
        from: mb.email,
        to: [mb.recovery_email],
        subject,
        text,
        html,
      }),
    });
    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error('Resend send failed:', resendRes.status, errText);
      // Don't expose this to the caller — always return ok.
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error('request-password-reset error:', err);
    // Still return ok: never let callers distinguish failure modes.
    return jsonResponse({ ok: true });
  }
});
