import { adminClient, jsonResponse, preflight } from '../_shared/http.ts';

// This endpoint is called from a Cloudflare Email Worker (not a user's
// browser) so we can't rely on a Supabase user JWT. Instead the worker
// signs the request body with an HMAC-SHA256 of a shared secret stored
// in the `app_secrets` table. `verify_jwt` is disabled at deploy time.

interface Address { address: string; name?: string | null }

interface ParsedAttachment {
  filename: string;
  mimeType?: string;
  size?: number;
  contentBase64: string; // base64 of raw bytes
}

interface InboundPayload {
  messageId: string;
  from: Address;
  to: Address[];
  cc?: Address[];
  subject?: string;
  text?: string;
  html?: string;
  date?: string; // ISO string if available
  attachments?: ParsedAttachment[];
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a[i] ^ b[i];
  return out === 0;
}

async function hmacSha256(secret: string, body: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return new Uint8Array(sig);
}

function sanitizeStoragePath(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const admin = adminClient();

  try {
    // 1. Read body as text so HMAC is computed over the exact bytes received.
    const rawBody = await req.text();

    // 2. Look up shared secret & verify signature.
    const secretRow = await admin
      .from('app_secrets')
      .select('value')
      .eq('name', 'cloudflare_worker_secret')
      .maybeSingle();
    if (secretRow.error || !secretRow.data?.value) {
      console.error('missing cloudflare_worker_secret');
      return jsonResponse({ error: 'server misconfigured' }, 500);
    }
    const providedSig = req.headers.get('x-whymail-signature') ?? '';
    if (!providedSig) return jsonResponse({ error: 'missing signature' }, 401);

    let providedBytes: Uint8Array;
    try { providedBytes = hexToBytes(providedSig); }
    catch { return jsonResponse({ error: 'bad signature encoding' }, 401); }

    const expected = await hmacSha256(secretRow.data.value as string, rawBody);
    if (!bytesEqual(expected, providedBytes)) {
      return jsonResponse({ error: 'invalid signature' }, 401);
    }

    // 3. Parse payload.
    const payload = JSON.parse(rawBody) as InboundPayload;
    if (!payload.to || payload.to.length === 0) {
      return jsonResponse({ error: 'missing recipient' }, 400);
    }

    // 4. Match the first recipient against a hosted mailbox (case-insensitive).
    //    If multiple of our mailboxes are recipients we write one row per match.
    const addressesLower = payload.to
      .concat(payload.cc ?? [])
      .map((a) => a.address.toLowerCase())
      .filter(Boolean);

    const mailboxRes = await admin
      .from('email_accounts')
      .select('id, user_id, email, enabled')
      .in('email', addressesLower);
    if (mailboxRes.error) throw mailboxRes.error;
    const mailboxes = (mailboxRes.data ?? []).filter((m) => m.enabled !== false);

    if (mailboxes.length === 0) {
      // Not one of ours — nothing to do but ack so the worker doesn't retry.
      return jsonResponse({ ok: true, stored: 0, skipped: 'no matching mailbox' });
    }

    let storedCount = 0;
    for (const mb of mailboxes) {
      const sentAt = payload.date ?? new Date().toISOString();
      const insertRes = await admin
        .from('emails')
        .upsert(
          {
            user_id: mb.user_id,
            account_id: mb.id,
            message_id: payload.messageId,
            folder: 'inbox',
            from_address: payload.from?.address ?? '',
            from_name: payload.from?.name ?? null,
            to_addresses: payload.to.map((a) => a.address),
            cc_addresses: payload.cc?.length ? payload.cc.map((a) => a.address) : null,
            subject: payload.subject ?? '(no subject)',
            body_text: payload.text ?? '',
            body_html: payload.html ?? null,
            is_read: false,
            sent_at: sentAt,
          },
          { onConflict: 'account_id,message_id' },
        )
        .select('id')
        .single();
      if (insertRes.error) {
        console.error('insert email failed:', insertRes.error);
        continue;
      }

      for (const att of payload.attachments ?? []) {
        if (!att.filename) continue;
        const safeName = sanitizeStoragePath(att.filename);
        const storagePath = `${mb.user_id}/${insertRes.data.id}/${safeName}`;
        const bytes = fromBase64(att.contentBase64);
        const upload = await admin.storage.from('attachments').upload(storagePath, bytes, {
          contentType: att.mimeType || 'application/octet-stream',
          upsert: true,
        });
        if (upload.error) {
          console.error('attachment upload failed:', att.filename, upload.error);
          continue;
        }
        await admin.from('attachments').upsert(
          {
            email_id: insertRes.data.id,
            user_id: mb.user_id,
            filename: att.filename,
            mime_type: att.mimeType ?? null,
            size_bytes: att.size ?? bytes.byteLength,
            storage_path: storagePath,
          },
          { onConflict: 'email_id,filename', ignoreDuplicates: false },
        );
      }

      await admin
        .from('email_accounts')
        .update({ last_activity_at: new Date().toISOString() })
        .eq('id', mb.id);

      storedCount++;
    }

    return jsonResponse({ ok: true, stored: storedCount });
  } catch (err) {
    console.error('receive-email error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
