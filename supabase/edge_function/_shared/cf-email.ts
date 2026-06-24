// Cloudflare Email Sending REST API client.
//
// Endpoint: POST https://api.cloudflare.com/client/v4/accounts/{account_id}/email/sending/send
// Auth: Bearer {API_TOKEN} with `Account.Email Sending: Edit` scope.
// Total request size limit (subject + body + attachments base64): 5 MiB.
//
// The domain referenced in `from` must be onboarded for Email Sending on the
// account (one-time manual click in CF dashboard → Email Service → Email
// Sending → Onboard Domain). There is no public API for onboarding.

export interface CfEmailAttachment {
  filename: string;
  contentBase64: string;
  mimeType?: string;
  disposition?: 'attachment' | 'inline';
  contentId?: string;
}

export interface CfSendInput {
  accountId: string;
  token: string;
  from: string;
  fromName?: string | null;
  to: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: CfEmailAttachment[];
  headers?: Record<string, string>;
}

export interface CfSendResult {
  delivered: string[];
  permanentBounces: string[];
  queued: string[];
  providerId: string;
}

interface CfEnvelope {
  success: boolean;
  result?: { delivered?: string[]; permanent_bounces?: string[]; queued?: string[] };
  errors?: Array<{ code: number; message: string }>;
}

export async function sendViaCloudflare(input: CfSendInput): Promise<CfSendResult> {
  if (!input.accountId) throw new Error('cf-email: accountId required');
  if (!input.token) throw new Error('cf-email: token required');
  if (!input.from) throw new Error('cf-email: from required');
  if (!input.to || input.to.length === 0) throw new Error('cf-email: at least one to recipient required');
  if (!input.text && !input.html) throw new Error('cf-email: at least one of text or html required');

  const fromField: string | { address: string; name: string } = input.fromName
    ? { address: input.from, name: input.fromName.replace(/"/g, '') }
    : input.from;

  const body: Record<string, unknown> = { from: fromField, to: input.to, subject: input.subject };
  if (input.cc && input.cc.length) body.cc = input.cc;
  if (input.bcc && input.bcc.length) body.bcc = input.bcc;
  if (input.text) body.text = input.text;
  if (input.html) body.html = input.html;
  if (input.replyTo) body.reply_to = input.replyTo;
  if (input.headers && Object.keys(input.headers).length) body.headers = input.headers;
  if (input.attachments && input.attachments.length) {
    body.attachments = input.attachments.map((a) => ({
      content: a.contentBase64,
      filename: a.filename,
      type: a.mimeType ?? 'application/octet-stream',
      disposition: a.disposition ?? 'attachment',
      ...(a.contentId ? { content_id: a.contentId } : {}),
    }));
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${input.accountId}/email/sending/send`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${input.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  let envelope: CfEnvelope | null = null;
  try { envelope = await res.json() as CfEnvelope; } catch { /* non-json response */ }

  if (!res.ok || !envelope?.success) {
    const detail = envelope?.errors?.map((e) => `[${e.code}] ${e.message}`).join('; ')
      ?? `HTTP ${res.status}`;
    throw new Error(`cf-email send failed: ${detail}`);
  }

  const delivered = envelope.result?.delivered ?? [];
  const permanentBounces = envelope.result?.permanent_bounces ?? [];
  const queued = envelope.result?.queued ?? [];

  const fromDomain = input.from.split('@')[1] ?? 'whymail.local';
  const providerId = `cfes-${crypto.randomUUID()}@${fromDomain}`;

  return { delivered, permanentBounces, queued, providerId };
}

export async function getCloudflareEmailCreds(
  admin: { from: (table: string) => { select: (cols: string) => { in: (col: string, vals: string[]) => Promise<{ data: unknown; error: unknown }> } } },
): Promise<{ accountId: string | null; token: string | null }> {
  const res = await admin.from('app_secrets').select('name, value').in('name', ['cloudflare_account_id', 'cloudflare_email_sending_token']);
  if (res.error) {
    console.error('getCloudflareEmailCreds error:', res.error);
    return { accountId: null, token: null };
  }
  const rows = (res.data as Array<{ name: string; value: string }>) ?? [];
  return {
    accountId: rows.find((r) => r.name === 'cloudflare_account_id')?.value ?? null,
    token: rows.find((r) => r.name === 'cloudflare_email_sending_token')?.value ?? null,
  };
}
