import { adminClient, jsonResponse, preflight, requireUser, UnauthorizedError } from '../_shared/http.ts';
import { sendViaCloudflare, getCloudflareEmailCreds, type CfEmailAttachment } from '../_shared/cf-email.ts';

interface AttachmentRef { path: string; filename: string; mimeType?: string; size?: number; }
interface SendPayload {
  accountId: string;
  fromAliasId?: string;
  to: string; cc?: string; bcc?: string;
  subject?: string;
  body?: string; bodyHtml?: string;
  attachments?: AttachmentRef[];
  inReplyTo?: string;
  references?: string[];
}

// Cloudflare Email Sending caps each request at 5 MiB (subject + body + base64
// attachments). Anything that pushes total above this threshold gets converted
// to a signed-URL download link in the message body instead of an inline
// attachment.
const INLINE_TOTAL_THRESHOLD = 3 * 1024 * 1024;   // 3 MB raw → ~4 MB base64
const SIGNED_URL_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

function splitAddresses(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
}

async function toBase64(bytes: Uint8Array): Promise<string> {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  return btoa(binary);
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

interface LinkedFile { filename: string; sizeBytes: number; url: string }

function renderLinkedTextBlock(files: LinkedFile[]): string {
  const totalMb = (files.reduce((s, f) => s + f.sizeBytes, 0) / (1024 * 1024)).toFixed(1);
  const lines: string[] = ['', '---', `Files attached via cloud link (${totalMb} MB, links expire in 30 days):`];
  for (const f of files) { lines.push(`  - ${f.filename} (${formatBytes(f.sizeBytes)})`); lines.push(`    ${f.url}`); }
  return lines.join('\n');
}

function renderLinkedHtmlBlock(files: LinkedFile[]): string {
  const totalMb = (files.reduce((s, f) => s + f.sizeBytes, 0) / (1024 * 1024)).toFixed(1);
  const items = files.map((f) => `<li style="margin-bottom:6px;line-height:1.4;"><a href="${escapeHtml(f.url)}" style="color:#2563eb;text-decoration:underline;font-size:13px;">${escapeHtml(f.filename)}</a><span style="color:#9ca3af;font-size:11px;margin-left:6px;">(${formatBytes(f.sizeBytes)})</span></li>`).join('');
  return `<div style="margin-top:24px;padding:16px;border-top:1px solid #e5e7eb;background:#f9fafb;border-radius:8px;font-family:system-ui,-apple-system,sans-serif;"><p style="margin:0 0 8px;font-size:13px;color:#374151;font-weight:600;">Files attached via cloud link (${totalMb} MB)</p><p style="margin:0 0 12px;font-size:11px;color:#6b7280;">Click to download. Links expire in 30 days.</p><ul style="list-style:none;padding:0;margin:0;">${items}</ul></div>`;
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
      if (!alias || alias.mailbox_id !== account.id) return jsonResponse({ error: 'Selected alias does not belong to this mailbox' }, 403);
      fromEmail = alias.alias_email as string;
      fromDisplayName = (alias.display_name as string | null) ?? fromDisplayName;
    }

    const toList = splitAddresses(payload.to);
    const ccList = splitAddresses(payload.cc);
    const bccList = splitAddresses(payload.bcc);
    if (toList.length === 0) return jsonResponse({ error: 'At least one recipient required' }, 400);

    interface PreparedAttachment { ref: AttachmentRef; bytes: Uint8Array; base64?: string }
    const prepared: PreparedAttachment[] = [];
    for (const att of payload.attachments ?? []) {
      if (!att.path.startsWith(`${user.id}/`)) return jsonResponse({ error: `Attachment path not permitted: ${att.path}` }, 400);
      const download = await admin.storage.from('attachments').download(att.path);
      if (download.error || !download.data) return jsonResponse({ error: `Attachment download failed: ${att.filename}` }, 500);
      const buffer = new Uint8Array(await download.data.arrayBuffer());
      prepared.push({ ref: att, bytes: buffer });
    }
    const attachmentRowsForDb: AttachmentRef[] = prepared.map((p) => ({ ...p.ref, size: p.bytes.byteLength }));

    const totalRawBytes = prepared.reduce((s, p) => s + p.bytes.byteLength, 0);
    const subjectFinal = payload.subject?.trim() || '(no subject)';

    let inlineAtts: PreparedAttachment[] = [];
    const linkedFiles: LinkedFile[] = [];

    if (totalRawBytes <= INLINE_TOTAL_THRESHOLD) {
      for (const p of prepared) p.base64 = await toBase64(p.bytes);
      inlineAtts = prepared;
    } else {
      for (const p of prepared) {
        const { data, error } = await admin.storage.from('attachments').createSignedUrl(p.ref.path, SIGNED_URL_TTL_SECONDS);
        if (error || !data?.signedUrl) return jsonResponse({ error: `Could not create download link for ${p.ref.filename}: ${error?.message ?? 'unknown'}` }, 500);
        linkedFiles.push({ filename: p.ref.filename, sizeBytes: p.bytes.byteLength, url: data.signedUrl });
      }
    }

    let textBody = payload.body ?? '';
    let htmlBody = payload.bodyHtml ?? (payload.body ? payload.body.replace(/\n/g, '<br/>') : undefined);
    if (linkedFiles.length > 0) {
      textBody = textBody + renderLinkedTextBlock(linkedFiles);
      htmlBody = (htmlBody ?? textBody.replace(/\n/g, '<br/>')) + renderLinkedHtmlBlock(linkedFiles);
    }

    const creds = await getCloudflareEmailCreds(admin);
    if (!creds.accountId || !creds.token) return jsonResponse({ success: false, error: 'Cloudflare Email Sending is not configured' }, 500);

    const cfAttachments: CfEmailAttachment[] = inlineAtts.map((p) => ({ filename: p.ref.filename, contentBase64: p.base64!, mimeType: p.ref.mimeType, disposition: 'attachment' }));
    const customHeaders: Record<string, string> = {};
    if (payload.inReplyTo) customHeaders['In-Reply-To'] = payload.inReplyTo;
    if (payload.references?.length) customHeaders['References'] = payload.references.join(' ');

    let providerId: string;
    try {
      const result = await sendViaCloudflare({
        accountId: creds.accountId, token: creds.token,
        from: fromEmail, fromName: fromDisplayName,
        to: toList,
        cc: ccList.length ? ccList : undefined,
        bcc: bccList.length ? bccList : undefined,
        subject: subjectFinal,
        text: textBody,
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
      console.error('send-email -> sendViaCloudflare error:', msg);
      return jsonResponse({ success: false, error: msg }, 502);
    }

    const messageId = `<${providerId}@${fromEmail.split('@')[1]}>`;
    const inReplyToFinal = payload.inReplyTo?.trim() || null;
    const referencesFinal = payload.references?.length ? payload.references : null;

    const insertEmail = await admin.from('emails').insert({
      user_id: user.id,
      account_id: payload.accountId,
      message_id: messageId,
      in_reply_to: inReplyToFinal,
      email_references: referencesFinal,
      folder: 'sent',
      from_address: fromEmail,
      from_name: fromDisplayName,
      to_addresses: toList,
      cc_addresses: ccList.length ? ccList : null,
      bcc_addresses: bccList.length ? bccList : null,
      subject: subjectFinal,
      body_text: textBody,
      body_html: htmlBody ?? null,
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

    return jsonResponse({
      success: true, messageId, providerId, provider: 'cloudflare',
      emailId: insertEmail.data?.id ?? null,
      attachmentMode: linkedFiles.length > 0 ? 'cloud-link' : 'inline',
      linkedCount: linkedFiles.length,
      inlineCount: inlineAtts.length,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return jsonResponse({ error: err.message }, 401);
    console.error('send-email error:', err);
    return jsonResponse({ success: false, error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
