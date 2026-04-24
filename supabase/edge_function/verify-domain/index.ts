import { adminClient, jsonResponse, preflight, requireUser, UnauthorizedError } from '../_shared/http.ts';

// Cloudflare Email Routing publishes these three MX hostnames as of 2024-2025.
// Order doesn't matter for the check; any of them being present is enough.
const CLOUDFLARE_MX_HOSTS = new Set([
  'route1.mx.cloudflare.net',
  'route2.mx.cloudflare.net',
  'route3.mx.cloudflare.net',
]);

// Resend requires a CNAME-based DKIM record on this host. For the base case
// we just check that at least one of the expected selectors resolves to a
// Resend-signed value. Users can add their own selector record manually; we
// keep the check lenient (any DKIM record under the expected selector counts).
const RESEND_DKIM_SELECTOR = 'resend';
const RESEND_SPF_INCLUDE = 'amazonses.com';

interface CheckResult {
  name: 'mx' | 'spf' | 'dkim' | 'dmarc';
  pass: boolean;
  observed: string | null;
  expected: string;
  message?: string;
}

async function resolveTxt(name: string): Promise<string[]> {
  try {
    const records = (await Deno.resolveDns(name, 'TXT')) as string[][];
    return records.map((chunks) => chunks.join(''));
  } catch {
    return [];
  }
}

async function resolveMx(name: string): Promise<Array<{ preference: number; exchange: string }>> {
  try {
    return (await Deno.resolveDns(name, 'MX')) as Array<{ preference: number; exchange: string }>;
  } catch {
    return [];
  }
}

async function resolveCname(name: string): Promise<string[]> {
  try {
    return (await Deno.resolveDns(name, 'CNAME')) as string[];
  } catch {
    return [];
  }
}

function normHost(host: string): string {
  return host.toLowerCase().replace(/\.$/, '');
}

async function checkMx(domain: string): Promise<CheckResult> {
  const records = await resolveMx(domain);
  const observed = records.map((r) => `${r.preference} ${normHost(r.exchange)}`).join('; ') || null;
  const pass = records.some((r) => CLOUDFLARE_MX_HOSTS.has(normHost(r.exchange)));
  return {
    name: 'mx',
    pass,
    observed,
    expected: [...CLOUDFLARE_MX_HOSTS].join(', '),
    message: pass
      ? undefined
      : `MX must point to Cloudflare Email Routing (${[...CLOUDFLARE_MX_HOSTS].join(' / ')}).`,
  };
}

async function checkSpf(domain: string): Promise<CheckResult> {
  const records = await resolveTxt(domain);
  const spf = records.find((r) => r.startsWith('v=spf1')) ?? null;
  const pass = !!spf && (spf.includes(`include:${RESEND_SPF_INCLUDE}`) || spf.includes('include:_spf.resend.com'));
  return {
    name: 'spf',
    pass,
    observed: spf,
    expected: `v=spf1 include:${RESEND_SPF_INCLUDE} ~all`,
    message: spf
      ? (pass ? undefined : `SPF exists but is missing include:${RESEND_SPF_INCLUDE}.`)
      : 'No SPF (TXT v=spf1) record found. Add the Resend-provided TXT record.',
  };
}

async function checkDkim(domain: string): Promise<CheckResult> {
  const host = `${RESEND_DKIM_SELECTOR}._domainkey.${domain}`;
  const txt = await resolveTxt(host);
  const cname = await resolveCname(host);
  const observed = txt[0] ?? (cname[0] ? `CNAME ${cname[0]}` : null);
  // Resend currently uses a CNAME to resend.com; accept either form as long
  // as the host resolves to something valid.
  const pass = txt.some((t) => t.includes('v=DKIM1') || t.includes('p=')) || cname.length > 0;
  return {
    name: 'dkim',
    pass,
    observed,
    expected: `CNAME ${RESEND_DKIM_SELECTOR}._domainkey.${domain} → resend.com`,
    message: pass
      ? undefined
      : `No DKIM record found at ${host}. Add the CNAME that Resend gave you.`,
  };
}

async function checkDmarc(domain: string): Promise<CheckResult> {
  const records = await resolveTxt(`_dmarc.${domain}`);
  const dmarc = records.find((r) => r.startsWith('v=DMARC1')) ?? null;
  return {
    name: 'dmarc',
    pass: !!dmarc,
    observed: dmarc,
    expected: `v=DMARC1; p=none; rua=mailto:dmarc@${domain}`,
    message: dmarc ? undefined : 'No DMARC record found (optional but recommended).',
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const admin = adminClient();
  try {
    const user = await requireUser(req, admin);
    const { domainId } = (await req.json()) as { domainId?: string };
    if (!domainId) return jsonResponse({ error: 'domainId is required' }, 400);

    const domainRes = await admin
      .from('domains')
      .select('id, user_id, name')
      .eq('id', domainId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (domainRes.error) throw domainRes.error;
    const domain = domainRes.data;
    if (!domain) return jsonResponse({ error: 'Domain not found' }, 404);

    const checks = await Promise.all([
      checkMx(domain.name),
      checkSpf(domain.name),
      checkDkim(domain.name),
      checkDmarc(domain.name),
    ]);

    // MX and DKIM are required for a working mailbox; SPF and DMARC are
    // strongly recommended but not strictly required for delivery.
    const required = checks.filter((c) => c.name === 'mx' || c.name === 'dkim');
    const allRequiredPass = required.every((c) => c.pass);
    const anyPass = checks.some((c) => c.pass);
    const verification_status: 'verified' | 'pending' | 'failed' =
      allRequiredPass && checks.every((c) => c.pass) ? 'verified'
      : (allRequiredPass || anyPass) ? 'pending'
      : 'failed';

    const updateRes = await admin
      .from('domains')
      .update({ verified: allRequiredPass, verification_status })
      .eq('id', domainId)
      .select('id, verified, verification_status')
      .single();
    if (updateRes.error) throw updateRes.error;

    return jsonResponse({ verified: allRequiredPass, verification_status, checks });
  } catch (err) {
    if (err instanceof UnauthorizedError) return jsonResponse({ error: err.message }, 401);
    console.error('verify-domain error:', err);
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
