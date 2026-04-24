import { adminClient, jsonResponse, preflight, requireUser, UnauthorizedError } from '../_shared/http.ts';

interface AttachmentRef {
  path: string;
  filename: string;
  mimeType?: string;
  size?: number;
}

interface SendPayload {
  accountId: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  body?: string;
  bodyHtml?: string;
  attachments?: AttachmentRef[];
  inReplyTo?: string;
  references?: string[];
}

function splitAddresses(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
}

async function getResendApiKey(admin: ReturnType<typeof adminClient>): Promise<string> {
  const { data, error } = await admin
    .from('app_secrets')
    .select('value')
    .eq('name', 'resend_api_key')
    .maybeSingle();
  if (error) throw error;
  if (!data?.value) throw new Error('resend_api_key is not configured');
  return data.value as string;
}

async function toBase64(bytes: Uint8Array): Promise<string> {
  // Chunked conversion to avoid stack overflow on large attachments.
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const admin = adminClient();

  try {
    const user = await requireUser(req, admin);
    const payload = (await req.json()) as SendPayload;

    if (!payload?.accountId) return jsonResponse({ error: 'accountId is required' }, 400);
    if (!payload.to?.trim()) return jsonResponse({ error: 'Recipient is required' }, 400);

    const accountResult = await admin
      .from('email_accounts')
      .select('id, email, display_name, enabled')
      .eq('id', payload.accountId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (accountResult.error) throw accountResult.error;
    const account = accountResult.data;
    if (!account) return jsonResponse({ error: 'Mailbox not found' }, 404);
    if (account.enabled === false) return jsonResponse({ error: 'Mailbox is disabled' }, 400);

    const toList = splitAddresses(payload.to);
    const ccList = splitAddresses(payload.cc);
    const bccList = splitAddresses(payload.bcc);
    if (toList.length === 0) return jsonResponse({ error: 'At least one recipient required' }, 400);

    // Collect attachment bytes for Resend.
    const resendAttachments: Array<{ filename: string; content: string; content_type?: string }> = [];
    const attachmentRowsForDb: AttachmentRef[] = [];
    for (const att of payload.attachments ?? []) {
      if (!att.path.startsWith(`${user.id}/`)) {
        return jsonResponse({ error: `Attachment path not permitted: ${att.path}` }, 400);
      }
      const download = await admin.storage.from('attachments').download(att.path);
      if (download.error || !download.data) {
        return jsonResponse({ error: `Attachment download failed: ${att.filename}` }, 500);
      }
      const buffer = new Uint8Array(await download.data.arrayBuffer());
      resendAttachments.push({
        filename: att.filename,
        content: await toBase64(buffer),
        content_type: att.mimeType,
      });
      attachmentRowsForDb.push({ ...att, size: buffer.byteLength });
    }

    const fromHeader = account.display_name
      ? `${account.display_name.replace(/"/g, '')} <${account.email}>`
      : account.email;

    const apiKey = await getResendApiKey(admin);
    const resendBody: Record<string, unknown> = {
      from: fromHeader,
      to: toList,
      subject: payload.subject?.trim() || '(no subject)',
      text: payload.body ?? '',
      html: payload.bodyHtml ?? (payload.body ? payload.body.replace(/\n/g, '<br/>') : undefined),
    };
    if (ccList.length) resendBody.cc = ccList;
    if (bccList.length) resendBody.bcc = bccList;
    if (resendAttachments.length) resendBody.attachments = resendAttachments;
    if (payload.inReplyTo) resendBody.headers = { 'In-Reply-To': payload.inReplyTo };
    if (payload.references?.length) {
      const headers = (resendBody.headers as Record<string, string>) ?? {};
      headers['References'] = payload.references.join(' ');
      resendBody.headers = headers;
    }

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(resendBody),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      return jsonResponse({ success: false, error: `Resend ${resendRes.status}: ${errText}` }, 502);
    }
    const resendData = (await resendRes.json()) as { id?: string };
    const providerId = resendData.id ?? crypto.randomUUID();
    const messageId = `<${providerId}@${account.email.split('@')[1]}>`;

    const insertEmail = await admin
      .from('emails')
      .insert({
        user_id: user.id,
        account_id: payload.accountId,
        message_id: messageId,
        folder: 'sent',
        from_address: account.email,
        from_name: account.display_name ?? null,
        to_addresses: toList,
        cc_addresses: ccList.length ? ccList : null,
        bcc_addresses: bccList.length ? bccList : null,
        subject: payload.subject?.trim() || '(no subject)',
        body_text: payload.body ?? '',
        body_html: payload.bodyHtml ?? null,
        is_read: true,
        sent_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (insertEmail.error) {
      console.error('Failed to persist sent email:', insertEmail.error);
    } else if (attachmentRowsForDb.length > 0) {
      const rows = attachmentRowsForDb.map((a) => ({
        email_id: insertEmail.data.id,
        user_id: user.id,
        filename: a.filename,
        mime_type: a.mimeType ?? null,
        size_bytes: a.size ?? 0,
        storage_path: a.path,
      }));
      const { error: attErr } = await admin.from('attachments').insert(rows);
      if (attErr) console.error('Failed to persist attachment rows:', attErr);
    }

    await admin
      .from('email_accounts')
      .update({ last_activity_at: new Date().toISOString() })
      .eq('id', payload.accountId);

    return jsonResponse({
      success: true,
      messageId,
      providerId,
      emailId: insertEmail.data?.id ?? null,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return jsonResponse({ error: err.message }, 401);
    console.error('send-email error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonResponse({ success: false, error: message }, 500);
  }
});
