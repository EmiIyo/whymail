import { adminClient, jsonResponse, preflight, requireUser, UnauthorizedError } from '../_shared/http.ts';

interface Payload { domainId: string; }

async function getSecret(admin: ReturnType<typeof adminClient>, name: string): Promise<string | null> {
  const r = await admin.from('app_secrets').select('value').eq('name', name).maybeSingle();
  if (r.error) throw r.error;
  return (r.data?.value as string | undefined) ?? null;
}

async function cfFetch<T = unknown>(token: string, path: string): Promise<{ status: number; body: T }> {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  let body: unknown = null;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body: body as T };
}

// After the user clicks "Onboard Domain" in the Cloudflare Email Sending
// dashboard (the one manual step CF has no public API for), this endpoint
// re-checks the cf-bounce subdomain on their behalf and flips the domain's
// verified flag in our DB.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  const admin = adminClient();
  try {
    const user = await requireUser(req, admin);
    const { domainId } = (await req.json()) as Payload;
    if (!domainId) return jsonResponse({ error: 'domainId is required' }, 400);

    const dRes = await admin.from('domains').select('id, name, user_id').eq('id', domainId).maybeSingle();
    if (dRes.error) throw dRes.error;
    const domain = dRes.data;
    if (!domain) return jsonResponse({ error: 'Domain not found' }, 404);

    const { data: isSuper } = await admin.rpc('is_super_admin', { p_user_id: user.id });
    if (!isSuper) {
      const adminRes = await admin.rpc('is_domain_admin', { p_domain_id: domainId, p_user_id: user.id });
      if (!adminRes.data) return jsonResponse({ error: 'Not authorized for this domain' }, 403);
    }

    const cfToken = await getSecret(admin, 'cloudflare_api_token') ?? await getSecret(admin, 'cloudflare_email_sending_token');
    if (!cfToken) return jsonResponse({ error: 'Cloudflare API token missing' }, 500);

    const zoneRes = await cfFetch<{ result: Array<{ id: string }> }>(cfToken, `/zones?name=${encodeURIComponent(domain.name)}`);
    const zone = zoneRes.body?.result?.[0];
    if (!zone) {
      return jsonResponse({ error: `Zone ${domain.name} not in our Cloudflare account` }, 404);
    }

    const cfBounceRes = await cfFetch<{ result: Array<unknown> }>(cfToken, `/zones/${zone.id}/dns_records?name=cf-bounce.${domain.name}&type=MX`);
    const dkimRes = await cfFetch<{ result: Array<unknown> }>(cfToken, `/zones/${zone.id}/dns_records?name=cf-bounce._domainkey.${domain.name}&type=TXT`);
    const mxCount = cfBounceRes.body?.result?.length ?? 0;
    const dkimCount = dkimRes.body?.result?.length ?? 0;
    const ready = mxCount >= 1 && dkimCount >= 1;

    // NOTE: outbound_provider column was dropped after FE decommission — don't write it.
    const upd = await admin.from('domains')
      .update({
        verified: ready,
        verification_status: ready ? 'verified' : 'pending',
      })
      .eq('id', domainId)
      .select('id, verified, verification_status')
      .single();
    if (upd.error) throw upd.error;

    return jsonResponse({
      ok: true,
      ready,
      domain: upd.data,
      checks: { cf_bounce_mx: mxCount, cf_bounce_dkim: dkimCount },
      hint: ready
        ? 'Email Sending is onboarded. Outbound from this domain works now.'
        : 'Email Sending NOT yet onboarded. Go to Cloudflare dashboard → Email Service → Email Sending → Onboard Domain.',
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return jsonResponse({ error: err.message }, 401);
    console.error('refresh-domain-outbound error:', err);
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
