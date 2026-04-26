import { adminClient, jsonResponse, preflight, requireUser, UnauthorizedError } from '../_shared/http.ts';

type Kind = 'logo' | 'bimi';

interface UpdatePayload {
  domainId: string;
  kind?: Kind;        // default 'logo'
  logoBase64?: string;
  mimeType?: string;
  clear?: boolean;
}

const MAX_BYTES = 1024 * 1024;
const LOGO_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
const BIMI_MIME = 'image/svg+xml';
const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

const COLUMN_BY_KIND: Record<Kind, 'brand_logo_url' | 'brand_bimi_url'> = {
  logo: 'brand_logo_url',
  bimi: 'brand_bimi_url',
};
const PREFIX_BY_KIND: Record<Kind, string> = {
  logo: 'logo',
  bimi: 'bimi',
};

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const admin = adminClient();

  try {
    const adminUser = await requireUser(req, admin);
    const payload = (await req.json()) as UpdatePayload;
    if (!payload?.domainId) return jsonResponse({ error: 'domainId is required' }, 400);

    const kind: Kind = payload.kind ?? 'logo';
    if (kind !== 'logo' && kind !== 'bimi') {
      return jsonResponse({ error: `Unsupported kind: ${kind}` }, 400);
    }

    const dRes = await admin
      .from('domains')
      .select('id, user_id, brand_logo_url, brand_bimi_url')
      .eq('id', payload.domainId)
      .maybeSingle();
    if (dRes.error) throw dRes.error;
    const domain = dRes.data;
    if (!domain) return jsonResponse({ error: 'Domain not found' }, 404);
    if (domain.user_id !== adminUser.id) return jsonResponse({ error: 'You do not own this domain' }, 403);

    const column = COLUMN_BY_KIND[kind];
    const filePrefix = PREFIX_BY_KIND[kind];

    if (payload.clear) {
      // Remove only files of this kind, leave the other one intact.
      const list = await admin.storage.from('branding').list(payload.domainId, { limit: 100 });
      const paths = (list.data ?? [])
        .filter((o) => o.name.startsWith(`${filePrefix}-`))
        .map((o) => `${payload.domainId}/${o.name}`);
      if (paths.length > 0) {
        await admin.storage.from('branding').remove(paths).catch((err) => console.error('branding cleanup failed', err));
      }
      const upd = await admin
        .from('domains')
        .update({ [column]: null })
        .eq('id', payload.domainId)
        .select('id, brand_logo_url, brand_bimi_url')
        .single();
      if (upd.error) throw upd.error;
      return jsonResponse({ domain: upd.data });
    }

    if (!payload.logoBase64 || !payload.mimeType) {
      return jsonResponse({ error: 'logoBase64 and mimeType are required' }, 400);
    }

    if (kind === 'bimi') {
      if (payload.mimeType !== BIMI_MIME) {
        return jsonResponse({ error: 'BIMI logo must be an SVG (image/svg+xml). Convert to BIMI SVG Tiny PS first.' }, 400);
      }
    } else {
      if (!LOGO_MIMES.has(payload.mimeType)) {
        return jsonResponse({ error: 'Unsupported image type. Use PNG, JPEG, WEBP or SVG.' }, 400);
      }
    }

    const bytes = fromBase64(payload.logoBase64);
    if (bytes.byteLength > MAX_BYTES) {
      return jsonResponse({ error: 'File must be under 1 MB' }, 400);
    }

    const ext = EXT_BY_MIME[payload.mimeType];
    const cacheKey = Date.now().toString(36);
    const path = `${payload.domainId}/${filePrefix}-${cacheKey}.${ext}`;

    const upload = await admin.storage.from('branding').upload(path, bytes, {
      contentType: payload.mimeType,
      upsert: true,
    });
    if (upload.error) throw upload.error;

    // Remove older versions of THIS kind only.
    const list = await admin.storage.from('branding').list(payload.domainId, { limit: 100 });
    const olderPaths = (list.data ?? [])
      .filter((o) => o.name.startsWith(`${filePrefix}-`))
      .map((o) => `${payload.domainId}/${o.name}`)
      .filter((p) => p !== path);
    if (olderPaths.length > 0) {
      admin.storage.from('branding').remove(olderPaths).catch((err) => console.error('older logo cleanup failed', err));
    }

    const publicUrl = admin.storage.from('branding').getPublicUrl(path).data.publicUrl;

    const upd = await admin
      .from('domains')
      .update({ [column]: publicUrl })
      .eq('id', payload.domainId)
      .select('id, brand_logo_url, brand_bimi_url')
      .single();
    if (upd.error) throw upd.error;

    return jsonResponse({ domain: upd.data });
  } catch (err) {
    if (err instanceof UnauthorizedError) return jsonResponse({ error: err.message }, 401);
    console.error('update-domain-branding error:', err);
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
