import { adminClient, jsonResponse, preflight, requireUser, UnauthorizedError } from '../_shared/http.ts';

const CLOUDFLARE_MX_HOSTS = new Set([
  'route1.mx.cloudflare.net',
  'route2.mx.cloudflare.net',
  'route3.mx.cloudflare.net',
]);

type RecordKind = 'mx' | 'spf' | 'dkim' | 'dmarc' | 'routing' | 'verification' | 'return_path';

interface StoredRecord {
  id: string;
  kind: RecordKind;
  type: string;
  name: string;
  value: string;
  priority?: number;
}

interface CheckResult {
  id: string;
  kind: RecordKind;
  pass: boolean;
  observed: string | null;
  expected: string;
  message?: string;
}

function normHost(host: string): string {
  return host.toLowerCase().replace(/\.$/, '');
}

function qualifyName(host: string, domain: string): string {
  if (host === '@' || host === '' || host === domain) return domain;
  if (host.toLowerCase().endsWith(`.${domain.toLowerCase()}`)) return host;
  return `${host}.${domain}`;
}

async function resolveTxt(name: string): Promise<string[]> {
  try {
    const records = (await Deno.resolveDns(name, 'TXT')) as string[][];
    return records.map((chunks) => chunks.join(''));
  } catch { return []; }
}
async function resolveMx(name: string): Promise<Array<{ preference: number; exchange: string }>> {
  try { return (await Deno.resolveDns(name, 'MX')) as Array<{ preference: number; exchange: string }>; }
  catch { return []; }
}
async function resolveCname(name: string): Promise<string[]> {
  try { return (await Deno.resolveDns(name, 'CNAME')) as string[]; }
  catch { return []; }
}

async function checkRecord(rec: StoredRecord, domain: string): Promise<CheckResult> {
  const host = qualifyName(rec.name, domain);
  const expected = rec.value;

  if (rec.kind === 'routing') {
    return { id: rec.id, kind: rec.kind, pass: true, observed: null, expected, message: 'Routing rule cannot be checked via DNS — confirm in Cloudflare Email Routing.' };
  }

  if (rec.type === 'MX') {
    const records = await resolveMx(domain);
    const observed = records.map((r) => `${r.preference} ${normHost(r.exchange)}`).join('; ') || null;
    const want = normHost(expected);
    const pass = records.some((r) => normHost(r.exchange) === want);
    return { id: rec.id, kind: rec.kind, pass, observed, expected, message: pass ? undefined : `MX must include ${want}.` };
  }

  if (rec.type === 'TXT') {
    const records = await resolveTxt(host);
    if (rec.kind === 'spf') {
      const spf = records.find((r) => r.startsWith('v=spf1')) ?? null;
      // Pass if any of these recognized senders are included.
      const pass = !!spf && (spf.includes('include:amazonses.com') || spf.includes('include:_spf.resend.com') || spf.includes('include:spf.forwardemail.net') || spf.includes('include:_spf.mx.cloudflare.net'));
      return { id: rec.id, kind: rec.kind, pass, observed: spf, expected, message: spf ? (pass ? undefined : 'SPF exists but missing a recognized sender include.') : 'No SPF record found.' };
    }
    if (rec.kind === 'dmarc') {
      const dmarc = records.find((r) => r.startsWith('v=DMARC1')) ?? null;
      return { id: rec.id, kind: rec.kind, pass: !!dmarc, observed: dmarc, expected, message: dmarc ? undefined : 'No DMARC record (recommended).' };
    }
    if (rec.kind === 'verification') {
      const verify = records.find((r) => r.includes('forward-email-site-verification=')) ?? null;
      const pass = !!verify && verify.includes(expected.replace('forward-email-site-verification=', ''));
      return { id: rec.id, kind: rec.kind, pass, observed: verify, expected, message: pass ? undefined : 'ForwardEmail verification TXT not found at root.' };
    }
    // Generic TXT (e.g. DKIM as TXT)
    const observed = records[0] ?? null;
    if (rec.kind === 'dkim') {
      const dkim = records.find((r) => r.includes('v=DKIM1')) ?? null;
      return { id: rec.id, kind: rec.kind, pass: !!dkim, observed: dkim, expected, message: dkim ? undefined : `No DKIM TXT at ${host}.` };
    }
    const pass = records.some((r) => r.includes(expected) || expected.includes(r));
    return { id: rec.id, kind: rec.kind, pass, observed, expected };
  }

  if (rec.type === 'CNAME') {
    const cname = await resolveCname(host);
    const observed = cname[0] ?? null;
    const want = normHost(expected);
    const pass = cname.some((c) => normHost(c) === want);
    return { id: rec.id, kind: rec.kind, pass, observed: observed ? `CNAME ${observed}` : null, expected, message: pass ? undefined : `CNAME at ${host} should resolve to ${want}.` };
  }

  return { id: rec.id, kind: rec.kind, pass: false, observed: null, expected, message: `Unknown record type ${rec.type}` };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const admin = adminClient();
  try {
    const user = await requireUser(req, admin);
    const { domainId } = (await req.json()) as { domainId?: string };
    if (!domainId) return jsonResponse({ error: 'domainId is required' }, 400);

    const [{ data: isSuper }, domainRes] = await Promise.all([
      admin.rpc('is_super_admin', { p_user_id: user.id }),
      admin.from('domains').select('id, user_id, name, dns_records, resend_domain_id').eq('id', domainId).maybeSingle(),
    ]);
    if (domainRes.error) throw domainRes.error;
    const domain = domainRes.data;
    if (!domain) return jsonResponse({ error: 'Domain not found' }, 404);

    if (!isSuper) {
      const adminRes = await admin.rpc('is_domain_admin', { p_domain_id: domainId, p_user_id: user.id });
      if (adminRes.error) throw adminRes.error;
      if (!adminRes.data) return jsonResponse({ error: 'Not authorized for this domain' }, 403);
    }

    const stored = (domain.dns_records ?? []) as StoredRecord[];
    let recordsToCheck = stored.filter((r) => r && r.kind && r.kind !== 'routing' && r.id);
    if (recordsToCheck.length === 0) {
      recordsToCheck = [
        { id: 'mx-1', kind: 'mx', type: 'MX', name: '@', value: 'route1.mx.cloudflare.net' },
        { id: 'mx-2', kind: 'mx', type: 'MX', name: '@', value: 'route2.mx.cloudflare.net' },
        { id: 'mx-3', kind: 'mx', type: 'MX', name: '@', value: 'route3.mx.cloudflare.net' },
      ];
    }

    const checks = await Promise.all(recordsToCheck.map((r) => checkRecord(r, domain.name)));

    // Required for outbound: DKIM + verification (if ForwardEmail). Required for inbound: MX.
    const mxOk = checks.some((c) => c.kind === 'mx' && c.pass);
    const dkimChecks = checks.filter((c) => c.kind === 'dkim');
    const dkimOk = dkimChecks.length === 0 ? true : dkimChecks.some((c) => c.pass);
    const verifyChecks = checks.filter((c) => c.kind === 'verification');
    const verifyOk = verifyChecks.length === 0 ? true : verifyChecks.every((c) => c.pass);
    const spfOk = checks.find((c) => c.kind === 'spf')?.pass ?? true;
    const dmarcOk = checks.find((c) => c.kind === 'dmarc')?.pass ?? true;

    const allRequiredPass = mxOk && dkimOk && verifyOk;
    const verification_status: 'verified' | 'pending' | 'failed' =
      (allRequiredPass && spfOk && dmarcOk) ? 'verified'
      : allRequiredPass ? 'pending'
      : (mxOk || dkimOk || verifyOk) ? 'pending'
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
