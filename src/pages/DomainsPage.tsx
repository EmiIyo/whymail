import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Globe, CheckCircle, XCircle, Clock, Trash2, Copy, ChevronDown, ChevronUp, Users, X, ExternalLink } from 'lucide-react';
import { domainsApi, domainAdminsApi, type DomainCheckResult, type DomainVerifyResponse } from '@/api/index';
import { useAuth } from '@/hooks/useAuth';
import { useSuperAdmin } from '@/hooks/useSuperAdmin';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/index';
import type { Domain, DomainAdmin, DnsRecord } from '@/lib/index';

export default function DomainsPage() {
  const { user } = useAuth();
  const { isSuperAdmin } = useSuperAdmin();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState('');
  const [verifyResults, setVerifyResults] = useState<Record<string, DomainCheckResult[]>>({});

  const { data: domains = [], isLoading } = useQuery({
    queryKey: ['domains', user?.id],
    queryFn: () => domainsApi.list(),
    enabled: !!user,
  });

  const addMutation = useMutation({
    mutationFn: (name: string) => domainsApi.create(name),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['domains'] }); setNewDomain(''); setShowAdd(false); },
    onError: (err: Error) => toast({ title: 'Could not add domain', description: err.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => domainsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['domains'] }),
  });

  const verifyMutation = useMutation({
    mutationFn: (id: string) => domainsApi.verify(id),
    onSuccess: (res: DomainVerifyResponse, id: string) => {
      setVerifyResults((p) => ({ ...p, [id]: res.checks }));
      setExpanded(id);
      qc.invalidateQueries({ queryKey: ['domains'] });
      toast({
        title: res.verified ? 'Domain verified' : 'Verification incomplete',
        description: res.verified
          ? 'All DNS records look good.'
          : `${res.checks.filter((c) => !c.pass).length} of ${res.checks.length} records still need attention.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: 'Verify failed', description: err.message, variant: 'destructive' });
    },
  });

  const refreshOutboundMutation = useMutation({
    mutationFn: (id: string) => domainsApi.refreshOutbound(id),
    onSuccess: (res: { ok: boolean; ready: boolean; hint: string }) => {
      qc.invalidateQueries({ queryKey: ['domains'] });
      toast({
        title: res.ready ? 'Email Sending ready' : 'Still not onboarded',
        description: res.hint,
        variant: res.ready ? undefined : 'destructive',
      });
    },
    onError: (err: Error) => {
      toast({ title: 'Refresh failed', description: err.message, variant: 'destructive' });
    },
  });

  // Multi-admin team management
  const [adminEmail, setAdminEmail] = useState<Record<string, string>>({});

  const addAdminMutation = useMutation({
    mutationFn: ({ domainId, email }: { domainId: string; email: string }) =>
      domainAdminsApi.add(domainId, email),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['domain-admins', vars.domainId] });
      setAdminEmail((s) => ({ ...s, [vars.domainId]: '' }));
      toast({ title: 'Admin added' });
    },
    onError: (err: Error) => {
      toast({ title: 'Could not add admin', description: err.message, variant: 'destructive' });
    },
  });

  const removeAdminMutation = useMutation({
    mutationFn: ({ domainId, userId }: { domainId: string; userId: string }) =>
      domainAdminsApi.remove(domainId, userId),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['domain-admins', vars.domainId] });
      toast({ title: 'Admin removed' });
    },
    onError: (err: Error) => {
      toast({ title: 'Could not remove admin', description: err.message, variant: 'destructive' });
    },
  });

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  };

  const statusIcon = (d: Domain) => {
    if (d.verified) return <CheckCircle size={14} className="text-primary-foreground" />;
    if (d.verificationStatus === 'failed') return <XCircle size={14} className="text-primary-foreground/50" />;
    return <Clock size={14} className="text-primary-foreground/40" />;
  };

  return (
    <div className="h-full overflow-y-auto bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-border bg-background">
        <div>
          <h1 className="text-base font-semibold text-foreground">Domains</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Connect custom domains to send and receive email</p>
        </div>
        {isSuperAdmin && (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 bg-primary text-primary-foreground text-xs font-medium px-3 py-2 rounded-lg hover:bg-primary/80 transition-colors"
          >
            <Plus size={14} /> Add Domain
          </button>
        )}
      </div>

      {/* Add domain form */}
      {showAdd && (
        <div className="mx-6 mt-4 p-4 border border-border rounded-xl bg-accent/40">
          <p className="text-xs font-medium text-foreground mb-3">Add a new domain</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={newDomain}
              onChange={e => setNewDomain(e.target.value)}
              placeholder="yourdomain.com"
              className="flex-1 text-sm border border-border rounded-lg px-3 py-2 outline-none focus:border-foreground bg-background"
              onKeyDown={e => e.key === 'Enter' && newDomain.trim() && addMutation.mutate(newDomain.trim())}
            />
            <button
              onClick={() => addMutation.mutate(newDomain.trim())}
              disabled={!newDomain.trim() || addMutation.isPending}
              className="bg-primary text-primary-foreground text-xs px-4 py-2 rounded-lg hover:bg-primary/80 disabled:opacity-50 transition-colors"
            >
              {addMutation.isPending ? 'Adding…' : 'Add'}
            </button>
            <button onClick={() => setShowAdd(false)} className="text-xs text-muted-foreground px-2 hover:text-foreground">Cancel</button>
          </div>
        </div>
      )}

      {/* Domain list — extra bottom padding so the last expanded card clears the mobile tab bar */}
      <div className="px-6 py-4 space-y-3 pb-24 lg:pb-6">
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-5 h-5 border-2 border-border border-t-foreground rounded-full animate-spin" />
          </div>
        )}
        {!isLoading && domains.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Globe size={32} className="text-muted-foreground/60 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No domains yet</p>
            <p className="text-xs text-muted-foreground mt-1">Add a domain to start sending custom emails</p>
          </div>
        )}
        {domains.map(domain => (
          <div key={domain.id} className="border border-border rounded-xl overflow-hidden">
            {/* Row */}
            <div className="flex items-center gap-3 px-4 py-3">
              <button
                type="button"
                onClick={() => setExpanded(expanded === domain.id ? null : domain.id)}
                className="flex-1 min-w-0 text-left active:bg-muted -mx-2 px-2 py-1 rounded-md transition-colors"
              >
                <div className="flex items-center gap-2">
                  {statusIcon(domain)}
                  <span className="text-sm font-medium text-foreground truncate">{domain.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    domain.verified ? 'bg-primary text-primary-foreground' :
                    domain.verificationStatus === 'failed' ? 'bg-muted text-muted-foreground' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {domain.verified ? 'Verified' : domain.verificationStatus === 'failed' ? 'Failed' : 'Pending'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Added {formatDate(domain.createdAt)}</p>
              </button>
              <div className="flex items-center gap-2">
                {!domain.verified && (
                  <button
                    onClick={() => verifyMutation.mutate(domain.id)}
                    disabled={verifyMutation.isPending}
                    className="text-xs text-foreground/70 border border-border px-2.5 py-1 rounded-lg hover:border-foreground hover:text-foreground transition-colors"
                  >
                    Verify
                  </button>
                )}
                <button
                  onClick={() => setExpanded(expanded === domain.id ? null : domain.id)}
                  className="p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors"
                >
                  {expanded === domain.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                <button
                  onClick={() => deleteMutation.mutate(domain.id)}
                  className="p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {/* DNS records */}
            {expanded === domain.id && (
              <div className="border-t border-border/60 px-4 py-3 bg-accent/40 space-y-4">
                <AdminsSection
                  domainId={domain.id}
                  currentUserId={user?.id}
                  emailDraft={adminEmail[domain.id] ?? ''}
                  onEmailChange={(v) => setAdminEmail((s) => ({ ...s, [domain.id]: v }))}
                  onAdd={() => addAdminMutation.mutate({ domainId: domain.id, email: adminEmail[domain.id] ?? '' })}
                  onRemove={(uid) => removeAdminMutation.mutate({ domainId: domain.id, userId: uid })}
                  isAdding={addAdminMutation.isPending}
                  isRemoving={removeAdminMutation.isPending}
                />
                <DomainSetupWizard
                  onRefreshOutbound={(id) => refreshOutboundMutation.mutate(id)}
                  refreshingOutbound={refreshOutboundMutation.isPending && refreshOutboundMutation.variables === domain.id}
                  domain={domain}
                  checks={verifyResults[domain.id]}
                  copiedKey={copied}
                  onCopy={copyText}
                  onVerify={() => verifyMutation.mutate(domain.id)}
                  isVerifying={verifyMutation.isPending && verifyMutation.variables === domain.id}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

interface AdminsSectionProps {
  domainId: string;
  currentUserId: string | undefined;
  emailDraft: string;
  onEmailChange: (v: string) => void;
  onAdd: () => void;
  onRemove: (userId: string) => void;
  isAdding: boolean;
  isRemoving: boolean;
}

function AdminsSection({
  domainId, currentUserId, emailDraft, onEmailChange, onAdd, onRemove, isAdding, isRemoving,
}: AdminsSectionProps) {
  const { data: admins = [], isLoading } = useQuery({
    queryKey: ['domain-admins', domainId],
    queryFn: () => domainAdminsApi.list(domainId),
  });
  const owner = admins.find((a) => a.isOwner);
  const isCurrentUserOwner = !!owner && owner.userId === currentUserId;
  const coAdmins = admins.filter((a) => !a.isOwner);

  return (
    <div>
      <p className="text-xs font-medium text-foreground/70 mb-2 flex items-center gap-1.5">
        <Users size={12} /> Admins
      </p>
      <div className="bg-background border border-border rounded-lg divide-y divide-black/5">
        {isLoading && (
          <div className="px-3 py-3 text-xs text-muted-foreground">Loading…</div>
        )}

        {owner && (
          <AdminRow
            admin={owner}
            roleLabel="Owner"
            canRemove={false}
            onRemove={() => { /* no-op for owner */ }}
            isRemoving={false}
          />
        )}

        {coAdmins.map((a) => (
          <AdminRow
            key={a.userId}
            admin={a}
            roleLabel="Admin"
            canRemove={isCurrentUserOwner}
            onRemove={() => {
              if (window.confirm(`Remove this admin from the domain?`)) onRemove(a.userId);
            }}
            isRemoving={isRemoving}
          />
        ))}

        {!isLoading && coAdmins.length === 0 && (
          <div className="px-3 py-2.5 text-[11px] text-muted-foreground">
            No co-admins yet. Add another WhyMail user to share full domain control.
          </div>
        )}
      </div>

      {isCurrentUserOwner && (
        <div className="mt-2 flex gap-2">
          <input
            type="email"
            value={emailDraft}
            onChange={(e) => onEmailChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && emailDraft.trim() && onAdd()}
            placeholder="user@example.com (must already have a WhyMail account)"
            className="flex-1 text-xs border border-border rounded-lg px-3 py-2 outline-none focus:border-foreground bg-background"
          />
          <button
            onClick={onAdd}
            disabled={isAdding || !emailDraft.trim()}
            className="text-xs bg-primary text-primary-foreground px-3 py-2 rounded-lg hover:bg-primary/80 disabled:opacity-50 transition-colors"
          >
            {isAdding ? 'Adding…' : 'Add admin'}
          </button>
        </div>
      )}
    </div>
  );
}

interface AdminRowProps {
  admin: DomainAdmin;
  roleLabel: string;
  canRemove: boolean;
  onRemove: () => void;
  isRemoving: boolean;
}

function AdminRow({ admin, roleLabel, canRemove, onRemove, isRemoving }: AdminRowProps) {
  const display = admin.email || `User ${admin.userId.slice(0, 8)}…`;
  return (
    <div className="flex items-center justify-between px-3 py-2.5 gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold text-foreground/70 shrink-0">
          {(display[0] ?? '?').toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-foreground/85 truncate">{display}</p>
          <p className="text-[10px] text-muted-foreground">{roleLabel}{admin.addedAt ? ` · added ${formatDate(admin.addedAt)}` : ''}</p>
        </div>
      </div>
      {canRemove && (
        <button
          onClick={onRemove}
          disabled={isRemoving}
          className="p-1.5 text-muted-foreground hover:text-red-600 rounded transition-colors disabled:opacity-50"
          title="Remove admin"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

// ─── Setup status panel ──────────────────────────────────────────────────────
// Everything below is automated by the create-domain edge function:
//  - DNS records (SPF/DMARC) written to Cloudflare
//  - Cloudflare Email Routing enabled + catch-all rule set to whymail-email-worker
//  - Detection of Cloudflare Email Sending onboarding via cf-bounce subdomain
//
// This panel is therefore a status dashboard, not a setup wizard. It surfaces:
//  - Which records exist (Show records)
//  - Whether each verify check passes (after the user clicks Verify now)
//  - Deep links into the Cloudflare dashboard for inspection or troubleshooting
// The only manual action: one-time Email Sending onboarding click in Cloudflare
// dashboard (no public API for this yet) — then user hits Refresh in this UI.

interface WizardProps {
  domain: Domain;
  checks?: DomainCheckResult[];
  copiedKey: string;
  onCopy: (text: string, key: string) => void;
  onVerify: () => void;
  isVerifying: boolean;
  onRefreshOutbound?: (domainId: string) => void;
  refreshingOutbound?: boolean;
}

function DomainSetupWizard({ domain, checks, copiedKey, onCopy, onVerify, isVerifying, onRefreshOutbound, refreshingOutbound }: WizardProps) {
  const records = domain.dnsRecords ?? [];
  const recordsByKind = (kind: DnsRecord['kind']) => records.filter((r) => r.kind === kind);
  const checkById = (id: string) => checks?.find((c) => c.id === id);

  const cfMxRecords = recordsByKind('mx').filter((r) => r.name === '@');
  const spfRecords = recordsByKind('spf');
  const dkimRecords = recordsByKind('dkim');
  const dmarcRecords = recordsByKind('dmarc');
  const verificationRecords = recordsByKind('verification');
  const returnPathRecords = recordsByKind('return_path');
  const allDnsRecords = [
    ...cfMxRecords,
    ...verificationRecords,
    ...spfRecords,
    ...dkimRecords,
    ...returnPathRecords,
    ...dmarcRecords,
  ];

  const stepStatus = (passed: boolean, anyChecks: boolean): 'done' | 'pending' | 'idle' => {
    if (!anyChecks) return 'idle';
    return passed ? 'done' : 'pending';
  };

  const mxOk = cfMxRecords.some((r) => checkById(r.id)?.pass);
  const spfOk = spfRecords.every((r) => checkById(r.id)?.pass);
  const dkimOk = dkimRecords.length === 0 || dkimRecords.some((r) => checkById(r.id)?.pass);
  const dmarcOk = dmarcRecords.every((r) => checkById(r.id)?.pass);
  const verificationOk = verificationRecords.every((r) => checkById(r.id)?.pass);
  const returnPathOk = returnPathRecords.every((r) => checkById(r.id)?.pass);
  const dnsAllOk = mxOk && spfOk && dkimOk && verificationOk && returnPathOk && dmarcOk;

  const [showRecords, setShowRecords] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-foreground/70">Setup checklist</p>
        <button
          onClick={onVerify}
          disabled={isVerifying}
          className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:bg-primary/80 disabled:opacity-50 transition-colors flex items-center gap-1.5"
        >
          {isVerifying ? 'Checking…' : (
            <>
              <CheckCircle size={12} /> Verify now
            </>
          )}
        </button>
      </div>

      {/* Step 1 — Cloudflare Email Routing (auto-configured by create-domain) */}
      <WizardStep
        n={1}
        title="Inbound: Cloudflare Email Routing"
        status="done"
        description={
          <>
            <b>Auto-configured</b>. Email Routing is enabled, MX records are auto-locked
            to <code className="font-mono bg-accent/60 px-1.5 py-0.5 rounded">route1/2/3.mx.cloudflare.net</code>,
            and the catch-all rule sends every inbound message to{' '}
            <code className="font-mono bg-accent/60 px-1.5 py-0.5 rounded">whymail-email-worker</code>{' '}
            which posts it into your inbox.
          </>
        }
      >
        <a
          href={`https://dash.cloudflare.com/?to=/:account/${domain.name}/email/routing/routes`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:bg-primary/80 transition-colors w-fit"
        >
          <ExternalLink size={11} />
          Open Cloudflare Email Routing
        </a>
      </WizardStep>

      {/* Step 2 — Cloudflare Email Sending (one manual onboard click in CF dashboard, then Refresh) */}
      <WizardStep
        n={2}
        title="Outbound: Cloudflare Email Sending"
        status={domain.verified ? 'done' : 'pending'}
        description={
          domain.verified ? (
            <>
              <b>Active</b>. Cloudflare Email Sending is onboarded for this domain. Outbound mail
              goes through <code className="font-mono bg-accent/60 px-1.5 py-0.5 rounded">cf-bounce.{domain.name}</code>
              {' '}with CF-managed DKIM, SPF, and DMARC.
            </>
          ) : (
            <>
              <b>Manual step required</b>. Cloudflare has no public API for Email Sending domain
              onboarding (yet). Open Cloudflare dashboard →{' '}
              <b>Compute → Email Service → Email Sending</b> → <b>Onboard Domain</b>, pick{' '}
              <code className="font-mono bg-accent/60 px-1.5 py-0.5 rounded">{domain.name}</code>,
              confirm. CF auto-creates the <code className="font-mono">cf-bounce</code> subdomain.
              Come back here and hit <b>Refresh</b> below.
            </>
          )
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <a
            href="https://dash.cloudflare.com/?to=/:account/email/email-sending"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs bg-muted text-foreground/75 px-3 py-1.5 rounded-lg hover:bg-muted transition-colors w-fit"
          >
            <ExternalLink size={11} />
            Open Cloudflare Email Sending
          </a>
          {!domain.verified && (
            <button
              onClick={() => onRefreshOutbound?.(domain.id)}
              disabled={refreshingOutbound}
              className="inline-flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:bg-primary/80 disabled:opacity-50 transition-colors w-fit"
            >
              {refreshingOutbound ? 'Checking…' : 'Refresh status'}
            </button>
          )}
        </div>
      </WizardStep>

      {/* Step 3 — DNS records (reference / troubleshooting) */}
      <WizardStep
        n={3}
        title="DNS records"
        status={stepStatus(dnsAllOk, !!checks)}
        description={
          allDnsRecords.length === 0 ? (
            <span className="text-amber-700">No DNS records snapshot for this domain — try re-verifying.</span>
          ) : (
            <>
              <b>Auto-configured</b> when this domain was added. WhyMail wrote {allDnsRecords.length} DNS records (MX, SPF, DMARC, Cloudflare-managed DKIM) directly to your Cloudflare zone.{' '}
              <button onClick={() => setShowRecords((v) => !v)} className="underline">{showRecords ? 'Hide' : 'Show'} records</button>.
              {!!checks && !dnsAllOk && (
                <span className="block mt-1 text-amber-700">Some records are missing/changed. Click <a href={`https://dash.cloudflare.com/?to=/:account/${domain.name}/dns/records`} target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-1">Cloudflare DNS <ExternalLink size={9} /></a> to inspect or re-trigger Verify.</span>
              )}
            </>
          )
        }
      >
        {(showRecords || (!!checks && !dnsAllOk)) && allDnsRecords.length > 0 && (
          <>
            {allDnsRecords.some((r) => r.type === 'CNAME') && (
              <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2 text-[11px] text-blue-900 leading-relaxed">
                <b>CNAME proxy must be OFF (DNS only / gray cloud).</b> Orange-cloud proxy breaks DKIM/return-path lookups.
              </div>
            )}
            {allDnsRecords.map((rec) => (
              <RecordRow
                key={rec.id}
                record={rec}
                check={checkById(rec.id)}
                copyKey={`${domain.id}-${rec.id}`}
                copiedKey={copiedKey}
                onCopy={onCopy}
              />
            ))}
          </>
        )}
      </WizardStep>
    </div>
  );
}

// Pretty status icon for a wizard step.
type StepStatus = 'done' | 'pending' | 'idle';
function StatusBadge({ status }: { status: StepStatus }) {
  if (status === 'done') return <CheckCircle size={14} className="text-emerald-600" />;
  if (status === 'pending') return <XCircle size={14} className="text-amber-500" />;
  return <Clock size={14} className="text-muted-foreground" />;
}

interface WizardStepProps {
  n: number;
  title: string;
  status: StepStatus;
  description: React.ReactNode;
  check?: DomainCheckResult;
  children?: React.ReactNode;
}

function WizardStep({ n, title, status, description, check, children }: WizardStepProps) {
  return (
    <div className="bg-background border border-border rounded-xl p-3.5">
      <div className="flex items-start gap-3">
        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[11px] font-semibold text-foreground/70 shrink-0">
          {n}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-medium text-foreground">{title}</p>
            <StatusBadge status={status} />
          </div>
          <div className="text-[11px] text-foreground/70 leading-relaxed">{description}</div>
          {check?.message && status === 'pending' && (
            <p className="text-[11px] text-amber-700 mt-1.5">⚠ {check.message}</p>
          )}
          {children && <div className="mt-2.5 space-y-1.5">{children}</div>}
        </div>
      </div>
    </div>
  );
}

interface RecordRowProps {
  record: DnsRecord;
  check?: DomainCheckResult;
  copyKey: string;
  copiedKey: string;
  onCopy: (text: string, key: string) => void;
}

function RecordRow({ record, check, copyKey, copiedKey, onCopy }: RecordRowProps) {
  const passed = check?.pass;
  const isHostCopied = copiedKey === `${copyKey}-host`;
  const isValueCopied = copiedKey === `${copyKey}-value`;
  return (
    <div className={`rounded-lg border px-2.5 py-2 ${
      passed === true ? 'border-emerald-200 bg-emerald-50/30'
      : passed === false ? 'border-amber-200 bg-amber-50/30'
      : 'border-border bg-accent/40'
    }`}>
      {check && (
        <div className="text-[10px] uppercase tracking-wide mb-1.5">
          {passed
            ? <span className="text-emerald-700">✓ verified</span>
            : <span className="text-amber-700">{check.message ?? 'not found'}</span>}
        </div>
      )}
      <div className="grid grid-cols-[64px_1fr_auto] gap-2 items-center text-xs font-mono">
        <span className="text-muted-foreground">Type</span>
        <span className="text-foreground/85">{record.type}</span>
        <span />

        <span className="text-muted-foreground">Name</span>
        <span className="text-foreground/85 break-all">{record.name}</span>
        <button
          onClick={() => onCopy(record.name, `${copyKey}-host`)}
          className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
          title="Copy Name"
        >
          {isHostCopied ? <CheckCircle size={11} /> : <Copy size={11} />}
        </button>

        <span className="text-muted-foreground">Content</span>
        <span className="text-foreground/85 break-all">
          {record.priority !== undefined && <span className="text-muted-foreground mr-1">{record.priority}</span>}
          {record.value}
        </span>
        <button
          onClick={() => onCopy(record.value, `${copyKey}-value`)}
          className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
          title="Copy Content"
        >
          {isValueCopied ? <CheckCircle size={11} /> : <Copy size={11} />}
        </button>

        <span className="text-muted-foreground">TTL</span>
        <span className="text-muted-foreground">Auto</span>
        <span />
      </div>
      {record.note && <p className="text-[10px] text-muted-foreground mt-1.5">{record.note}</p>}
    </div>
  );
}
