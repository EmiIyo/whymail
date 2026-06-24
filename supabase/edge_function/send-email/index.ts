import { adminClient, jsonResponse, preflight, requireUser, UnauthorizedError } from '../_shared/http.ts';
import { sendViaCloudflare, getCloudflareEmailCreds, type CfEmailAttachment } from '../_shared/cf-email.ts';

interface AttachmentRef { path: string; filename: string; mimeType?: string; size?: number; }
interface SendPayload {
  accountId: string;
  fromAliasId?: string;
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

async function toBase64(bytes: Uint8Array): Promise<string> {
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

    const accountResult = await admin.from('email_accounts').select('id, email, display_name, enabled').eq('id', payload.accountId).eq('owner_user_id', user.id).maybeSingle();
    if (accountResult.error) throw accountResult.error;
    const account = accountResult.data;
    if (!account) return jsonResponse({ error: 'Mailbox not found' }, 404);
    if (account.enabled === false) return jsonResponse({ error: 'Mailbox is disabled' }, 400);

    let fromEmail = account.email as string;
    let fromDisplayName: string | null = (account.display_name as string | null) ?? null;
    if (payload.fromAliasId) {
      const aliasRes = await admin.from('mailbox_aliases').select('id, mailbox_id, alias_email, display_name').eq('id', payload.fromAliasId).maybeSingle();
      if (aliasRes.error) throw aliasRes.error;
      const alias = aliasRes.data;
      if (!alias || alias.mailbox_id !== account.id) {
        return jsonResponse({ error: 'Selected alias does not belong to this mailbox' }, 403);
      }
      fromEmail = alias.alias_email as string;
      fromDisplayName = (alias.display_name as string | null) ?? fromDisplayName;
    }

    const toList = splitAddresses(payload.to);
    const ccList = splitAddresses(payload.cc);
    const bccList = splitAddresses(payload.bcc);
    if (toList.length === 0) return jsonResponse({ error: 'At least one recipient required' }, 400);

    interface PreparedAttachment { ref: AttachmentRef; bytes: Uint8Array; base64: string }
    const prepared: PreparedAttachment[] = [];
    for (const att of payload.attachments ?? []) {
      if (!att.path.startsWith(`${user.id}/`)) return jsonResponse({ error: `Attachment path not permitted: ${att.path}` }, 400);
      const download = await admin.storage.from('attachments').download(att.path);
      if (download.error || !download.data) return jsonResponse({ error: `Attachment download failed: ${att.filename}` }, 500);
      const buffer = new Uint8Array(await download.data.arrayBuffer());
      prepared.push({ ref: att, bytes: buffer, base64: await toBase64(buffer) });
    }
    const attachmentRowsForDb: AttachmentRef[] = prepared.map((p) => ({ ...p.ref, size: p.bytes.byteLength }));

    const subjectFinal = payload.subject?.trim() || '(no subject)';
    const htmlBody = payload.bodyHtml ?? (payload.body ? payload.body.replace(/\n/g, '<br/>') : undefined);

    const creds = await getCloudflareEmailCreds(admin);
    if (!creds.accountId || !creds.token) {
      return jsonResponse({ success: false, error: 'Cloudflare Email Sending is not configured (missing token or account_id in app_secrets)' }, 500);
    }
    const cfAttachments: CfEmailAttachment[] = prepared.map((p) => ({
      filename: p.ref.filename,
      contentBase64: p.base64,
      mimeType: p.ref.mimeType,
      disposition: 'attachment',
    }));
    const customHeaders: Record<string, string> = {};
    if (payload.inReplyTo) customHeaders['In-Reply-To'] = payload.inReplyTo;
    if (payload.references?.length) customHeaders['References'] = payload.references.join(' ');

    let providerId: string;
    try {
      const result = await sendViaCloudflare({
        accountId: creds.accountId,
        token: creds.token,
        from: fromEmail,
        fromName: fromDisplayName,
        to: toList,
        cc: ccList.length ? ccList : undefined,
        bcc: bccList.length ? bccList : undefined,
        subject: subjectFinal,
        text: payload.body ?? '',
        html: htmlBody,
        attachments: cfAttachments,
        headers: Object.keys(customHeaders).length ? customHeaders : undefined,
      });
      if (result.permanentBounces.length === toList.length + ccList.length + bccList.length) {
        return jsonResponse({ success: false, error: `All recipients bounced: ${result.permanentBounces.join(', ')}` }, 502);
      }
      providerId = result.providerId;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return jsonResponse({ success: false, error: msg }, 502);
    }

    const messageId = `<${providerId}@${fromEmail.split('@')[1]}>`;

    const insertEmail = await admin.from('emails').insert({
      user_id: user.id,
      account_id: payload.accountId,
      message_id: messageId,
      folder: 'sent',
      from_address: fromEmail,
      from_name: fromDisplayName,
      to_addresses: toList,
      cc_addresses: ccList.length ? ccList : null,
      bcc_addresses: bccList.length ? bccList : null,
      subject: subjectFinal,
      body_text: payload.body ?? '',
      body_html: payload.bodyHtml ?? null,
      is_read: true,
      sent_at: new Date().toISOString(),
    }).select('id').single();

    if (insertEmail.error) {
      console.error('Failed to persist sent email:', insertEmail.error);
    } else if (attachmentRowsForDb.length > 0) {
      const rows = attachmentRowsForDb.map((a) => ({ email_id: insertEmail.data.id, user_id: user.id, filename: a.filename, mime_type: a.mimeType ?? null, size_bytes: a.size ?? 0, storage_path: a.path }));
      const { error: attErr } = await admin.from('attachments').insert(rows);
      if (attErr) console.error('Failed to persist attachment rows:', attErr);
    }

    await admin.from('email_accounts').update({ last_activity_at: new Date().toISOString() }).eq('id', payload.accountId);

    return jsonResponse({ success: true, messageId, providerId, provider: 'cloudflare', emailId: insertEmail.data?.id ?? null });
  } catch (err) {
    if (err instanceof UnauthorizedError) return jsonResponse({ error: err.message }, 401);
    console.error('send-email error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonResponse({ success: false, error: message }, 500);
  }
});
