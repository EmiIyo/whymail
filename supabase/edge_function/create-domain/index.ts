import { adminClient, jsonResponse, preflight, requireUser, UnauthorizedError } from '../_shared/http.ts';

interface Payload { name: string; }
const NAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const WORKER_NAME = 'whymail-email-worker';

interface DesiredRecord {
  type: 'TXT';
  name: string;
  content: string;
  description: string;
}

async function getSecret(admin: ReturnType<typeof adminClient>, name: string): Promise<string | null> {
  const r = await admin.from('app_secrets').select('value').eq('name', name).maybeSingle();
  if (r.error) throw r.error;
  return (r.data?.value as string | undefined) ?? null;
}

async function cfFetch<T = unknown>(token: string, path: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  let body: unknown = null;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body: body as T };
}

function buildDnsRecordSnapshot(emailSendingReady: boolean): unknown[] {
  const records: unknown[] = [
    { id: 'mx-1', kind: 'mx', type: 'MX', name: '@', value: 'route1.mx.cloudflare.net', priority: 10, note: 'Cloudflare Email Routing inbound' },
    { id: 'mx-2', kind: 'mx', type: 'MX', name: '@', value: 'route2.mx.cloudflare.net', priority: 10 },
    { id: 'mx-3', kind: 'mx', type: 'MX', name: '@', value: 'route3.mx.cloudflare.net', priority: 10 },
    { id: 'spf', kind: 'spf', type: 'TXT', name: '@', value: 'v=spf1 include:_spf.mx.cloudflare.net ~all', note: 'CF-only SPF (cf-bounce subdomain inherits the same include)' },
    { id: 'dmarc', kind: 'dmarc', type: 'TXT', name: '_dmarc', value: 'v=DMARC1; p=reject; pct=100;', note: 'Strict DMARC' },
    { id: 'routing', kind: 'routing', type: 'EMAIL_ROUTING', name: '*', value: WORKER_NAME, note: 'Cloudflare catch-all → Send to a Worker' },
  ];
  if (emailSendingReady) {
    records.push({ id: 'cf-sending', kind: 'cf_email_sending', type: 'INFO', name: 'cf-bounce', value: 'onboarded', note: 'Cloudflare Email Sending domain onboarded — outbound mail enabled' });
  } else {
    records.push({ id: 'cf-sending-pending', kind: 'cf_email_sending', type: 'INFO', name: 'cf-bounce', value: 'pending', note: 'Onboard this domain in Cloudflare dashboard → Email Service → Email Sending to enable outbound' });
  }
  return records;
}

interface ReconcileResult {
  log: string[];
  emailSendingReady: boolean;
}

async function reconcileCloudflareDns(cfToken: string, domain: string): Promise<ReconcileResult> {
  const log: string[] = [];
  const zonesRes = await cfFetch<{ result: Array<{ id: string }> }>(cfToken, `/zones?name=${encodeURIComponent(domain)}`);
  const zone = zonesRes.body?.result?.[0];
  if (!zone) {
    log.push(`zone ${domain} not in this Cloudflare account — delegate NS to Cloudflare first`);
    return { log, emailSendingReady: false };
  }
  const zoneId = zone.id;

  const list = await cfFetch<{ result: Array<{ id: string; type: string; name: string; content: string }> }>(cfToken, `/zones/${zoneId}/dns_records?per_page=200`);
  const existing = list.body?.result ?? [];

  const dn = domain.toLowerCase();
  const cfMxHosts = new Set(['route1.mx.cloudflare.net', 'route2.mx.cloudflare.net', 'route3.mx.cloudflare.net']);
  const legacyTargets = (r: { type: string; name: string; content: string }) => {
    const n = r.name.toLowerCase();
    const c = (r.content || '').toLowerCase().replace(/\.$/, '');
    // ForwardEmail artifacts (since we no longer use FE)
    if (r.type === 'CNAME' && (n === `autoconfig.${dn}` || n === `autodiscover.${dn}` || n === `fe-bounces.${dn}`) && c.includes('forwardemail')) return true;
    if (r.type === 'TXT' && n === dn && c.includes('forward-email-site-verification')) return true;
    if (r.type === 'TXT' && n.startsWith('fe-') && n.includes('_domainkey')) return true;
    // Resend artifacts
    if (r.type === 'TXT' && n === `resend._domainkey.${dn}`) return true;
    if (r.type === 'TXT' && n === `send.${dn}` && c.startsWith('"v=spf1 include:amazonses.com')) return true;
    if (r.type === 'MX' && n === `send.${dn}` && c.includes('feedback-smtp')) return true;
    // SES (mail subdomain) artifacts
    if (r.type === 'TXT' && n === `mail.${dn}` && c.startsWith('"v=spf1 include:amazonses.com')) return true;
    if (r.type === 'MX' && n === `mail.${dn}` && c.includes('feedback-smtp')) return true;
    if (r.type === 'CNAME' && /\._domainkey\./.test(n) && c.endsWith('.dkim.amazonses.com')) return true;
    // Zoho artifacts
    if (r.type === 'MX' && (c.endsWith('.zoho.com') || c.endsWith('.zohomail.com') || c === 'zoho.com')) return true;
    if (r.type === 'TXT' && n === dn && c.startsWith('"zoho-verification=')) return true;
    if (r.type === 'TXT' && n === `zmail._domainkey.${dn}`) return true;
    // Any non-Cloudflare MX on the apex collides with Email Routing.
    if (r.type === 'MX' && n === dn && !cfMxHosts.has(c)) return true;
    return false;
  };

  for (const rec of existing) {
    if (legacyTargets(rec)) {
      const del = await cfFetch(cfToken, `/zones/${zoneId}/dns_records/${rec.id}`, { method: 'DELETE' });
      log.push(`deleted legacy ${rec.type} ${rec.name} (${del.status})`);
    }
  }

  const wantSpf = 'v=spf1 include:_spf.mx.cloudflare.net ~all';
  const oldRootSpf = existing.find((r) => r.type === 'TXT' && r.name.toLowerCase() === dn && r.content.toLowerCase().includes('v=spf1') && !legacyTargets(r));
  if (oldRootSpf) {
    const normalize = (v: string) => v.replace(/^"|"$/g, '').trim();
    if (normalize(oldRootSpf.content) !== wantSpf) {
      await cfFetch(cfToken, `/zones/${zoneId}/dns_records/${oldRootSpf.id}`, { method: 'PATCH', body: JSON.stringify({ content: wantSpf }) });
      log.push(`patched apex SPF`);
    }
  }

  const desired: DesiredRecord[] = [
    { type: 'TXT', name: dn, content: wantSpf, description: 'spf' },
    { type: 'TXT', name: `_dmarc.${dn}`, content: 'v=DMARC1; p=reject; pct=100;', description: 'dmarc' },
  ];

  const list2 = await cfFetch<{ result: Array<{ id: string; type: string; name: string; content: string }> }>(cfToken, `/zones/${zoneId}/dns_records?per_page=200`);
  const after = list2.body?.result ?? [];
  for (const want of desired) {
    const normalize = (v: string) => v.replace(/^"|"$/g, '').trim();
    const match = after.find((r) => r.type === want.type && r.name.toLowerCase() === want.name.toLowerCase() && normalize(r.content) === normalize(want.content));
    if (match) {
      log.push(`exists ${want.description} ${want.name}`);
      continue;
    }
    const existingSame = after.find((r) => r.type === want.type && r.name.toLowerCase() === want.name.toLowerCase());
    if (existingSame) {
      const patch = await cfFetch(cfToken, `/zones/${zoneId}/dns_records/${existingSame.id}`, { method: 'PATCH', body: JSON.stringify({ content: want.content }) });
      log.push(`patched ${want.description} ${want.name} (${patch.status})`);
      continue;
    }
    const create = await cfFetch(cfToken, `/zones/${zoneId}/dns_records`, {
      method: 'POST',
      body: JSON.stringify({ type: want.type, name: want.name, content: want.content, ttl: 1 }),
    });
    log.push(`created ${want.description} ${want.name} (${create.status})`);
  }

  const enable = await cfFetch(cfToken, `/zones/${zoneId}/email/routing/enable`, { method: 'POST', body: '{}' });
  log.push(`email routing enable ${enable.status}`);

  const catchAll = await cfFetch(cfToken, `/zones/${zoneId}/email/routing/rules/catch_all`, {
    method: 'PUT',
    body: JSON.stringify({
      matchers: [{ type: 'all' }],
      actions: [{ type: 'worker', value: [WORKER_NAME] }],
      enabled: true,
      name: 'catch-all',
    }),
  });
  log.push(`catch-all rule ${catchAll.status}`);

  // The one step we can't automate — user must click "Onboard Domain" in CF
  // dashboard. We detect onboarding by the auto-created cf-bounce DNS records.
  const cfBounceCheck = await cfFetch<{ result: Array<{ id: string }> }>(cfToken, `/zones/${zoneId}/dns_records?name=cf-bounce.${dn}&type=MX`);
  const emailSendingReady = (cfBounceCheck.body?.result?.length ?? 0) > 0;
  log.push(`email sending onboarded: ${emailSendingReady}`);

  return { log, emailSendingReady };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  const admin = adminClient();
  try {
    const caller = await requireUser(req, admin);
    const payload = (await req.json()) as Payload;
    if (!payload?.name?.trim()) return jsonResponse({ error: 'Domain name is required' }, 400);
    const name = payload.name.trim().toLowerCase();
    if (!NAME_RE.test(name)) return jsonResponse({ error: 'Invalid domain name' }, 400);

    const { data: isSuper, error: superErr } = await admin.rpc('is_super_admin', { p_user_id: caller.id });
    if (superErr) throw superErr;
    if (!isSuper) return jsonResponse({ error: 'Only the platform admin can add domains' }, 403);

    const dup = await admin.from('domains').select('id, user_id').eq('name', name).maybeSingle();
    if (dup.error) throw dup.error;
    if (dup.data) {
      return jsonResponse({
        error: dup.data.user_id === caller.id ? 'You have already added this domain' : 'This domain is already registered',
      }, 409);
    }

    const cfToken = await getSecret(admin, 'cloudflare_api_token') ?? await getSecret(admin, 'cloudflare_email_sending_token');
    if (!cfToken) {
      return jsonResponse({ error: 'Cloudflare API token missing in app_secrets' }, 500);
    }

    let reconcile: ReconcileResult = { log: [], emailSendingReady: false };
    try {
      reconcile = await reconcileCloudflareDns(cfToken, name);
    } catch (err) {
      console.error('Cloudflare reconciliation failed:', err);
      reconcile.log.push(`error: ${err instanceof Error ? err.message : 'unknown'}`);
    }

    const dnsRecords = buildDnsRecordSnapshot(reconcile.emailSendingReady);

    // NOTE: outbound_provider column was dropped after FE decommission — don't write it.
    const insert = await admin.from('domains').insert({
      user_id: caller.id,
      name,
      resend_domain_id: null,
      dns_records: dnsRecords,
      mx_record: '10 route1.mx.cloudflare.net',
      spf_record: 'v=spf1 include:_spf.mx.cloudflare.net ~all',
      dkim_record: null,
      dmarc_record: 'v=DMARC1; p=reject; pct=100;',
      verified: reconcile.emailSendingReady,
      verification_status: reconcile.emailSendingReady ? 'verified' : 'pending',
    }).select('*, email_accounts(count)').single();
    if (insert.error) throw insert.error;

    return jsonResponse({
      domain: insert.data,
      cloudflareAutomation: reconcile.log,
      emailSendingReady: reconcile.emailSendingReady,
      nextStep: reconcile.emailSendingReady
        ? 'Domain is fully ready. Create your first mailbox.'
        : 'Cloudflare Email Sending is not yet onboarded for this domain. Go to Cloudflare dashboard → Email Service → Email Sending → Onboard Domain, then click Refresh in WhyMail.',
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return jsonResponse({ error: err.message }, 401);
    console.error('create-domain error:', err);
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
