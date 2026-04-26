import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Globe, CheckCircle, XCircle, Clock, Trash2, Copy, ChevronDown, ChevronUp, Image as ImageIcon, Upload } from 'lucide-react';
import { domainsApi, type DomainCheckResult, type DomainVerifyResponse } from '@/api/index';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import type { Domain } from '@/lib/index';

export default function DomainsPage() {
  const { user } = useAuth();
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
    mutationFn: (name: string) => domainsApi.create(name, user!.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['domains'] }); setNewDomain(''); setShowAdd(false); },
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

  const brandingMutation = useMutation({
    mutationFn: (args: { domainId: string; file?: File; clear?: boolean }) =>
      domainsApi.updateBranding(args),
    onSuccess: (_, args) => {
      qc.invalidateQueries({ queryKey: ['domains'] });
      toast({
        title: args.clear ? 'Logo removed' : 'Logo uploaded',
        description: args.clear ? 'Outbound mail will no longer include the brand logo.' : 'New mail from this domain will include the logo footer.',
      });
    },
    onError: (err: Error) => {
      toast({ title: 'Logo update failed', description: err.message, variant: 'destructive' });
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
    <div className="flex-1 flex flex-col min-h-0 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-black/10">
        <div>
          <h1 className="text-base font-semibold text-black">Domains</h1>
          <p className="text-xs text-black/40 mt-0.5">Connect custom domains to send and receive email</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-black text-white text-xs font-medium px-3 py-2 rounded-lg hover:bg-black/80 transition-colors"
        >
          <Plus size={14} /> Add Domain
        </button>
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

      {/* Domain list */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
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
              <div className="flex-1 min-w-0">
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
                <p className="text-xs text-black/30 mt-0.5">Added {new Date(domain.createdAt).toLocaleDateString()}</p>
              </div>
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
                <BrandingSection
                  domain={domain}
                  isPending={brandingMutation.isPending}
                  onUpload={(file) => brandingMutation.mutate({ domainId: domain.id, file })}
                  onClear={() => brandingMutation.mutate({ domainId: domain.id, clear: true })}
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

interface BrandingSectionProps {
  domain: Domain;
  isPending: boolean;
  onUpload: (file: File) => void;
  onClear: () => void;
}

function BrandingSection({ domain, isPending, onUpload, onClear }: BrandingSectionProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <p className="text-xs font-medium text-black/60 mb-2 flex items-center gap-1.5">
        <ImageIcon size={12} /> Brand logo
      </p>
      <div className="bg-white border border-black/10 rounded-lg p-3">
        <div className="flex items-center gap-3">
          <div className="w-20 h-12 bg-black/[0.03] border border-black/10 rounded flex items-center justify-center overflow-hidden shrink-0">
            {domain.brandLogoUrl ? (
              <img src={domain.brandLogoUrl} alt={`${domain.name} logo`} className="max-w-full max-h-full object-contain" />
            ) : (
              <ImageIcon size={16} className="text-black/20" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-black/70">
              {domain.brandLogoUrl ? 'Appended to every outgoing email from this domain.' : 'No logo set. Upload one to brand outgoing mail.'}
            </p>
            <p className="text-[10px] text-black/40 mt-0.5">PNG, JPG, WEBP or SVG · max 1 MB</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              if (fileRef.current) fileRef.current.value = '';
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={isPending}
            className="text-xs flex items-center gap-1 bg-black text-white px-3 py-1.5 rounded-lg hover:bg-black/80 disabled:opacity-50 transition-colors"
          >
            <Upload size={12} />
            {isPending ? 'Uploading…' : (domain.brandLogoUrl ? 'Replace' : 'Upload')}
          </button>
          {domain.brandLogoUrl && (
            <button
              onClick={() => onClear()}
              disabled={isPending}
              className="text-xs text-black/50 px-2 hover:text-red-600 transition-colors"
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
