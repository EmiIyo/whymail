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
    if (d.verified) return <CheckCircle size={14} className="text-white" />;
    if (d.verificationStatus === 'failed') return <XCircle size={14} className="text-white/50" />;
    return <Clock size={14} className="text-white/40" />;
  };

  return (
    <div className="h-full overflow-y-auto bg-white">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-black/10 bg-white">
        <div>
          <h1 className="text-base font-semibold text-black">Domains</h1>
          <p className="text-xs text-black/40 mt-0.5">Connect custom domains to send and receive email</p>
        </div>
        {isSuperAdmin && (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 bg-black text-white text-xs font-medium px-3 py-2 rounded-lg hover:bg-black/80 transition-colors"
          >
            <Plus size={14} /> Add Domain
          </button>
        )}
      </div>

      {/* Add domain form */}
      {showAdd && (
        <div className="mx-6 mt-4 p-4 border border-black/10 rounded-xl bg-black/[0.02]">
          <p className="text-xs font-medium text-black mb-3">Add a new domain</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={newDomain}
              onChange={e => setNewDomain(e.target.value)}
              placeholder="yourdomain.com"
              className="flex-1 text-sm border border-black/20 rounded-lg px-3 py-2 outline-none focus:border-black bg-white"
              onKeyDown={e => e.key === 'Enter' && newDomain.trim() && addMutation.mutate(newDomain.trim())}
            />
            <button
              onClick={() => addMutation.mutate(newDomain.trim())}
              disabled={!newDomain.trim() || addMutation.isPending}
              className="bg-black text-white text-xs px-4 py-2 rounded-lg hover:bg-black/80 disabled:opacity-50 transition-colors"
            >
              {addMutation.isPending ? 'Adding…' : 'Add'}
            </button>
            <button onClick={() => setShowAdd(false)} className="text-xs text-black/40 px-2 hover:text-black">Cancel</button>
          </div>
        </div>
      )}

      {/* Domain list — extra bottom padding so the last expanded card clears the mobile tab bar */}
      <div className="px-6 py-4 space-y-3 pb-24 lg:pb-6">
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
          </div>
        )}
        {!isLoading && domains.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Globe size={32} className="text-black/20 mb-3" />
            <p className="text-sm font-medium text-black/40">No domains yet</p>
            <p className="text-xs text-black/30 mt-1">Add a domain to start sending custom emails</p>
          </div>
        )}
        {domains.map(domain => (
          <div key={domain.id} className="border border-black/10 rounded-xl overflow-hidden">
            {/* Row */}
            <div className="flex items-center gap-3 px-4 py-3">
              <button
                type="button"
                onClick={() => setExpanded(expanded === domain.id ? null : domain.id)}
                className="flex-1 min-w-0 text-left active:bg-black/5 -mx-2 px-2 py-1 rounded-md transition-colors"
              >
                <div className="flex items-center gap-2">
                  {statusIcon(domain)}
                  <span className="text-sm font-medium text-black truncate">{domain.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    domain.verified ? 'bg-black text-white' :
                    domain.verificationStatus === 'failed' ? 'bg-black/10 text-black/50' :
                    'bg-black/5 text-black/40'
                  }`}>
                    {domain.verified ? 'Verified' : domain.verificationStatus === 'failed' ? 'Failed' : 'Pending'}
                  </span>
                </div>
                <p className="text-xs text-black/30 mt-0.5">Added {formatDate(domain.createdAt)}</p>
              </button>
              <div className="flex items-center gap-2">
                {!domain.verified && (
                  <button
                    onClick={() => verifyMutation.mutate(domain.id)}
                    disabled={verifyMutation.isPending}
                    className="text-xs text-black/60 border border-black/20 px-2.5 py-1 rounded-lg hover:border-black hover:text-black transition-colors"
                  >
                    Verify
                  </button>
                )}
                <button
                  onClick={() => setExpanded(expanded === domain.id ? null : domain.id)}
                  className="p-1.5 text-black/40 hover:text-black rounded transition-colors"
                >
                  {expanded === domain.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                <button
                  onClick={() => deleteMutation.mutate(domain.id)}
                  className="p-1.5 text-black/40 hover:text-black rounded transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {/* DNS records */}
            {expanded === domain.id && (
              <div className="border-t border-black/5 px-4 py-3 bg-black/[0.02] space-y-4">
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
      <p className="text-xs font-medium text-black/60 mb-2 flex items-center gap-1.5">
        <Users size={12} /> Admins
      </p>
      <div className="bg-white border border-black/10 rounded-lg divide-y divide-black/5">
        {isLoading && (
          <div className="px-3 py-3 text-xs text-black/40">Loading…</div>
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
          <div className="px-3 py-2.5 text-[11px] text-black/40">
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
            className="flex-1 text-xs border border-black/15 rounded-lg px-3 py-2 outline-none focus:border-black bg-white"
          />
          <button
            onClick={onAdd}
            disabled={isAdding || !emailDraft.trim()}
            className="text-xs bg-black text-white px-3 py-2 rounded-lg hover:bg-black/80 disabled:opacity-50 transition-colors"
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
        <div className="w-7 h-7 rounded-full bg-black/5 flex items-center justify-center text-[10px] font-semibold text-black/60 shrink-0">
          {(display[0] ?? '?').toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-black/80 truncate">{display}</p>
          <p className="text-[10px] text-black/40">{roleLabel}{admin.addedAt ? ` · added ${formatDate(admin.addedAt)}` : ''}</p>
        </div>
      </div>
      {canRemove && (
        <button
          onClick={onRemove}
          disabled={isRemoving}
          className="p-1.5 text-black/40 hover:text-red-600 rounded transition-colors disabled:opacity-50"
          title="Remove admin"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

// ─── Setup wizard ────────────────────────────────────────────────────────────
// Walks the customer through: enabling Cloudflare Email Routing, adding DNS
// records (verification, SPF, DKIM, return-path, DMARC), creating the
// catch-all routing rule, and verifying. Records come from `domain.dnsRecords`
// (populated by the create-domain edge function with real per-domain
// ForwardEmail values from POST /v1/domains).

interface WizardProps {
  domain: Domain;
  checks?: DomainCheckResult[];
  copiedKey: string;
  onCopy: (text: string, key: string) => void;
  onVerify: () => void;
  isVerifying: boolean;
}

function DomainSetupWizard({ domain, checks, copiedKey, onCopy, onVerify, isVerifying }: WizardProps) {
  const records = domain.dnsRecords ?? [];
  const recordsByKind = (kind: DnsRecord['kind']) => records.filter((r) => r.kind === kind);
  const checkById = (id: string) => checks?.find((c) => c.id === id);

  // Cloudflare auto-adds the root MX records (route1/2/3.mx.cloudflare.net)
  // when Email Routing is enabled — those don't need manual entry. ForwardEmail
  // adds verification, DKIM, return-path CNAME, and SPF — those DO need manual entry.
  const allMxRecords = recordsByKind('mx');
  const cfMxRecords = allMxRecords.filter((r) => r.name === '@');
  const otherMxRecords = allMxRecords.filter((r) => r.name !== '@');
  const spfRecords = recordsByKind('spf');
  const dkimRecords = recordsByKind('dkim');
  const dmarcRecords = recordsByKind('dmarc');
  const verificationRecords = recordsByKind('verification');
  const returnPathRecords = recordsByKind('return_path');

  // Records that user must add manually in Cloudflare DNS (Step 2).
  const manualRecords = [
    ...verificationRecords,
    ...spfRecords,
    ...dkimRecords,
    ...returnPathRecords,
    ...dmarcRecords,
    ...otherMxRecords,
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
  const manualOk = spfOk && dmarcOk && dkimOk && verificationOk && returnPathOk;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-black/60">Setup steps</p>
        <button
          onClick={onVerify}
          disabled={isVerifying}
          className="text-xs bg-black text-white px-3 py-1.5 rounded-lg hover:bg-black/80 disabled:opacity-50 transition-colors flex items-center gap-1.5"
        >
          {isVerifying ? 'Checking…' : (
            <>
              <CheckCircle size={12} /> Verify now
            </>
          )}
        </button>
      </div>

      {/* Step 1 — Cloudflare Email Routing */}
      <WizardStep
        n={1}
        title="Enable Cloudflare Email Routing"
        status={stepStatus(mxOk, !!checks)}
        description={
          <>Open <a href={`https://dash.cloudflare.com/?to=/:account/${domain.name}/email/routing/overview`} target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-1">your zone's Email Routing page <ExternalLink size={10} /></a> and click <b>Enable Email Routing</b>. Cloudflare auto-adds the MX records.</>
        }
        check={checkById(cfMxRecords[0]?.id)}
      />

      {/* Step 2 — Add all DNS records (verification + SPF + DKIM + return-path + DMARC) */}
      <WizardStep
        n={2}
        title="Add DNS records"
        status={stepStatus(manualOk, !!checks)}
        description={
          dkimRecords.length === 0
            ? <span className="text-amber-700">ForwardEmail integration is not connected — DKIM records aren't available. Outbound mail will fail without these.</span>
            : <>Open Cloudflare DNS for your zone and add the records below. Each record's <b>Name</b> and <b>Content</b> have copy buttons.</>
        }
      >
        <div className="flex flex-wrap gap-2 mb-1">
          <a
            href={`https://dash.cloudflare.com/?to=/:account/${domain.name}/dns/records`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs bg-black text-white px-3 py-1.5 rounded-lg hover:bg-black/80 transition-colors"
          >
            <ExternalLink size={11} />
            Open Cloudflare DNS
          </a>
          <span className="text-[10px] text-black/40 self-center">Opens in a new tab — paste the values from below, then come back and click "Verify now".</span>
        </div>
        {manualRecords.some((r) => r.type === 'CNAME') && (
          <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2 text-[11px] text-blue-900 leading-relaxed">
            <b>For CNAME records: proxy OFF (DNS only / gray cloud).</b> Orange-cloud proxy returns Cloudflare's IPs instead of the actual target and breaks DKIM verification.
          </div>
        )}
        {manualRecords.map((rec) => (
          <RecordRow
            key={rec.id}
            record={rec}
            check={checkById(rec.id)}
            copyKey={`${domain.id}-${rec.id}`}
            copiedKey={copiedKey}
            onCopy={onCopy}
          />
        ))}
      </WizardStep>

      {/* Step 3 — Routing rule */}
      <WizardStep
        n={3}
        title="Create catch-all routing rule"
        status="idle"
        description={
          <>
            In Cloudflare → <b>Email Routing → Routes → Catch-all address</b>, set the action to{' '}
            <b>Send to a Worker</b> with destination{' '}
            <code className="font-mono bg-black/[0.04] px-1.5 py-0.5 rounded">whymail-email-worker</code>{' '}
            and <b>enable</b> it.
          </>
        }
      >
        <a
          href={`https://dash.cloudflare.com/?to=/:account/${domain.name}/email/routing/routes`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs bg-black text-white px-3 py-1.5 rounded-lg hover:bg-black/80 transition-colors w-fit"
        >
          <ExternalLink size={11} />
          Open Cloudflare Email Routing
        </a>
      </WizardStep>

      {/* Step 4 — Verify */}
      <WizardStep
        n={4}
        title="Verify"
        status={domain.verified ? 'done' : !!checks ? 'pending' : 'idle'}
        description={
          domain.verified
            ? 'All required records are in place. You can now create mailboxes on this domain.'
            : 'Click Verify above. DNS propagation can take 1–5 minutes; if a check fails, wait a bit and retry.'
        }
      />
    </div>
  );
}

// Pretty status icon for a wizard step.
type StepStatus = 'done' | 'pending' | 'idle';
function StatusBadge({ status }: { status: StepStatus }) {
  if (status === 'done') return <CheckCircle size={14} className="text-emerald-600" />;
  if (status === 'pending') return <XCircle size={14} className="text-amber-500" />;
  return <Clock size={14} className="text-black/30" />;
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
    <div className="bg-white border border-black/10 rounded-xl p-3.5">
      <div className="flex items-start gap-3">
        <div className="w-6 h-6 rounded-full bg-black/5 flex items-center justify-center text-[11px] font-semibold text-black/60 shrink-0">
          {n}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-medium text-black">{title}</p>
            <StatusBadge status={status} />
          </div>
          <div className="text-[11px] text-black/60 leading-relaxed">{description}</div>
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
      : 'border-black/10 bg-black/[0.02]'
    }`}>
      {check && (
        <div className="text-[10px] uppercase tracking-wide mb-1.5">
          {passed
            ? <span className="text-emerald-700">✓ verified</span>
            : <span className="text-amber-700">{check.message ?? 'not found'}</span>}
        </div>
      )}
      <div className="grid grid-cols-[64px_1fr_auto] gap-2 items-center text-xs font-mono">
        <span className="text-black/40">Type</span>
        <span className="text-black/80">{record.type}</span>
        <span />

        <span className="text-black/40">Name</span>
        <span className="text-black/80 break-all">{record.name}</span>
        <button
          onClick={() => onCopy(record.name, `${copyKey}-host`)}
          className="text-black/30 hover:text-black p-1 rounded transition-colors"
          title="Copy Name"
        >
          {isHostCopied ? <CheckCircle size={11} /> : <Copy size={11} />}
        </button>

        <span className="text-black/40">Content</span>
        <span className="text-black/80 break-all">
          {record.priority !== undefined && <span className="text-black/40 mr-1">{record.priority}</span>}
          {record.value}
        </span>
        <button
          onClick={() => onCopy(record.value, `${copyKey}-value`)}
          className="text-black/30 hover:text-black p-1 rounded transition-colors"
          title="Copy Content"
        >
          {isValueCopied ? <CheckCircle size={11} /> : <Copy size={11} />}
        </button>

        <span className="text-black/40">TTL</span>
        <span className="text-black/50">Auto</span>
        <span />
      </div>
      {record.note && <p className="text-[10px] text-black/40 mt-1.5">{record.note}</p>}
    </div>
  );
}
