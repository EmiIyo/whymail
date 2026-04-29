import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Globe, CheckCircle, XCircle, Clock, Trash2, Copy, ChevronDown, ChevronUp, Users, X } from 'lucide-react';
import { domainsApi, domainAdminsApi, type DomainCheckResult, type DomainVerifyResponse } from '@/api/index';
import { useAuth } from '@/hooks/useAuth';
import { useSuperAdmin } from '@/hooks/useSuperAdmin';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/index';
import type { Domain, DomainAdmin } from '@/lib/index';

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

  const dnsRecords = (d: Domain) => [
    { type: 'MX',   name: '@',                  value: '10 route1.mx.cloudflare.net',                                    note: 'Inbound via Cloudflare Email Routing' },
    { type: 'MX',   name: '@',                  value: '10 route2.mx.cloudflare.net',                                    note: 'Inbound via Cloudflare Email Routing' },
    { type: 'MX',   name: '@',                  value: '10 route3.mx.cloudflare.net',                                    note: 'Inbound via Cloudflare Email Routing' },
    { type: 'TXT',  name: '@',                  value: 'v=spf1 include:amazonses.com ~all',                              note: 'Outbound SPF (Resend uses AWS SES under the hood)' },
    { type: 'CNAME',name: `resend._domainkey`,  value: 'resend.com',                                                     note: 'DKIM for outbound (Resend will show the exact target when you verify the domain on resend.com)' },
    { type: 'TXT',  name: '_dmarc',             value: `v=DMARC1; p=none; rua=mailto:dmarc@${d.name}`,                   note: 'Optional but recommended' },
  ];

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
                <div>
                  <p className="text-xs font-medium text-black/60 mb-2">DNS Records — Add these in your Cloudflare DNS dashboard</p>
                  <div className="space-y-2">
                    {dnsRecords(domain).map((rec, i) => (
                      <div key={i} className="bg-white border border-black/10 rounded-lg px-3 py-2">
                        <div className="flex items-start gap-2 text-xs font-mono">
                          <span className="text-black/40 w-14 shrink-0">{rec.type}</span>
                          <span className="text-black/50 w-32 shrink-0 truncate">{rec.name}</span>
                          <span className="flex-1 text-black/80 break-all">{rec.value}</span>
                          <button
                            onClick={() => copyText(rec.value, `${domain.id}-${i}`)}
                            className="text-black/30 hover:text-black ml-1 shrink-0 transition-colors"
                          >
                            {copied === `${domain.id}-${i}` ? <CheckCircle size={12} /> : <Copy size={12} />}
                          </button>
                        </div>
                        {rec.note && (
                          <p className="text-[10px] text-black/40 mt-1 pl-16">{rec.note}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {verifyResults[domain.id] && (
                  <div>
                    <p className="text-xs font-medium text-black/60 mb-2">Last verification result</p>
                    <div className="space-y-1.5">
                      {verifyResults[domain.id].map((c) => (
                        <div key={c.name} className="flex items-start gap-2 text-xs bg-white border border-black/10 rounded-lg px-3 py-2">
                          {c.pass
                            ? <CheckCircle size={12} className="text-emerald-600 mt-0.5 shrink-0" />
                            : <XCircle size={12} className="text-red-500 mt-0.5 shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-black/80 uppercase tracking-wide text-[10px]">{c.name}</p>
                            {c.message && <p className="text-black/60 mt-0.5">{c.message}</p>}
                            {c.observed && <p className="text-black/40 mt-0.5 font-mono break-all">Observed: {c.observed}</p>}
                            {!c.pass && <p className="text-black/40 mt-0.5 font-mono break-all">Expected: {c.expected}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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
