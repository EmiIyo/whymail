import PostalMime from 'postal-mime';

export interface Env {
  WEBHOOK_URL: string;      // Supabase edge function URL for receive-email
  WEBHOOK_SECRET: string;   // Shared HMAC secret (matches app_secrets.cloudflare_worker_secret)
  MAX_RAW_BYTES?: string;   // Optional safety cap (default 25 MiB)
}

interface Address { address: string; name?: string | null }

interface OutboundPayload {
  messageId: string;
  from: Address;
  to: Address[];
  cc?: Address[];
  subject?: string;
  text?: string;
  html?: string;
  date?: string;
  attachments?: Array<{ filename: string; mimeType?: string; size?: number; contentBase64: string }>;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return bytesToHex(new Uint8Array(sig));
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function readStream(stream: ReadableStream<Uint8Array>, cap: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > cap) throw new Error(`raw body exceeds cap (${cap} bytes)`);
      chunks.push(value);
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.byteLength; }
  return out;
}

interface EmailMessage {
  readonly from: string;
  readonly to: string;
  readonly headers: Headers;
  readonly raw: ReadableStream<Uint8Array>;
  readonly rawSize: number;
  setReject(reason: string): void;
  forward(rcptTo: string, headers?: Headers): Promise<void>;
}

export default {
  async email(message: EmailMessage, env: Env, _ctx: ExecutionContext): Promise<void> {
    const cap = Number(env.MAX_RAW_BYTES ?? 25 * 1024 * 1024);
    let raw: Uint8Array;
    try {
      raw = await readStream(message.raw, cap);
    } catch (err) {
      message.setReject(err instanceof Error ? err.message : 'message too large');
      return;
    }

    const parsed = await PostalMime.parse(raw);

    const headerMessageId = message.headers.get('message-id');
    const messageId = (parsed.messageId || headerMessageId || `<${crypto.randomUUID()}@cf-worker>`).trim();

    const toList: Address[] = (parsed.to ?? []).map((a) => ({
      address: a.address ?? message.to,
      name: a.name ?? null,
    }));
    if (toList.length === 0) toList.push({ address: message.to });

    const ccList: Address[] = (parsed.cc ?? []).map((a) => ({
      address: a.address ?? '',
      name: a.name ?? null,
    })).filter((a) => a.address);

    const payload: OutboundPayload = {
      messageId,
      from: {
        address: parsed.from?.address ?? message.from,
        name: parsed.from?.name ?? null,
      },
      to: toList,
      cc: ccList.length ? ccList : undefined,
      subject: parsed.subject ?? '',
      text: parsed.text ?? '',
      html: parsed.html ?? '',
      date: parsed.date ? new Date(parsed.date).toISOString() : new Date().toISOString(),
      attachments: (parsed.attachments ?? [])
        .filter((a) => a.filename)
        .map((a) => {
          const bytes = a.content instanceof ArrayBuffer
            ? new Uint8Array(a.content)
            : new Uint8Array((a.content as unknown as ArrayBufferView).buffer);
          return {
            filename: a.filename as string,
            mimeType: a.mimeType ?? undefined,
            size: bytes.byteLength,
            contentBase64: bytesToBase64(bytes),
          };
        }),
    };

    const body = JSON.stringify(payload);
    const signature = await hmacSha256Hex(env.WEBHOOK_SECRET, body);

    const res = await fetch(env.WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-WhyMail-Signature': signature,
      },
      body,
    });

    if (!res.ok) {
      // Reject keeps the mail queued for retry on Cloudflare's side.
      const text = await res.text().catch(() => '');
      message.setReject(`webhook ${res.status}: ${text.slice(0, 200)}`);
    }
  },
};
