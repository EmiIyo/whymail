import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Mail, Trash2, ToggleLeft, ToggleRight, Server } from 'lucide-react';
import { accountsApi, domainsApi } from '@/api/index';
import { useAuth } from '@/hooks/useAuth';

interface NewAccountForm {
  email: string;
  displayName: string;
  domainId: string;
  imapHost: string;
  imapPort: string;
  smtpHost: string;
  smtpPort: string;
  username: string;
  password: string;
}

const EMPTY_FORM: NewAccountForm = {
  email: '', displayName: '', domainId: '',
  imapHost: '', imapPort: '993',
  smtpHost: '', smtpPort: '587',
  username: '', password: '',
};

export default function AccountsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<NewAccountForm>(EMPTY_FORM);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts', user?.id],
    queryFn: () => accountsApi.list(),
    enabled: !!user,
  });

  const { data: domains = [] } = useQuery({
    queryKey: ['domains', user?.id],
    queryFn: () => domainsApi.list(),
    enabled: !!user,
  });

  const addMutation = useMutation({
    mutationFn: () => accountsApi.create({
      userId: user!.id,
      domainId: form.domainId || undefined,
      email: form.email,
      displayName: form.displayName,
      imapHost: form.imapHost,
      imapPort: parseInt(form.imapPort) || 993,
      smtpHost: form.smtpHost,
      smtpPort: parseInt(form.smtpPort) || 587,
      username: form.username,
      password: form.password,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      setForm(EMPTY_FORM);
      setShowAdd(false);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => accountsApi.toggle(id, enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => accountsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  });

  const setField = (k: keyof NewAccountForm, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-black/10">
        <div>
          <h1 className="text-base font-semibold text-black">Email Accounts</h1>
          <p className="text-xs text-black/40 mt-0.5">Manage IMAP/SMTP accounts for sending and receiving</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-black text-white text-xs font-medium px-3 py-2 rounded-lg hover:bg-black/80 transition-colors"
        >
          <Plus size={14} /> Add Account
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="mx-6 mt-4 p-4 border border-black/10 rounded-xl bg-black/[0.02] space-y-3">
          <p className="text-xs font-semibold text-black">New Email Account</p>
          <div className="grid grid-cols-2 gap-3">
            {([
              ['email', 'Email address', 'you@yourdomain.com'],
              ['displayName', 'Display name', 'Your Name'],
              ['imapHost', 'IMAP host', 'mail.yourdomain.com'],
              ['imapPort', 'IMAP port', '993'],
              ['smtpHost', 'SMTP host', 'mail.yourdomain.com'],
              ['smtpPort', 'SMTP port', '587'],
              ['username', 'Username', 'you@yourdomain.com'],
              ['password', 'Password', '••••••••'],
            ] as [keyof NewAccountForm, string, string][]).map(([key, label, placeholder]) => (
              <div key={key}>
                <label className="text-[10px] font-medium text-black/50 uppercase tracking-wide mb-1 block">{label}</label>
                <input
                  type={key === 'password' ? 'password' : 'text'}
                  value={form[key]}
                  onChange={e => setField(key, e.target.value)}
                  placeholder={placeholder}
                  className="w-full text-sm border border-black/20 rounded-lg px-3 py-2 outline-none focus:border-black bg-white"
                />
              </div>
            ))}
            {domains.length > 0 && (
              <div className="col-span-2">
                <label className="text-[10px] font-medium text-black/50 uppercase tracking-wide mb-1 block">Link to Domain (optional)</label>
                <select
                  value={form.domainId}
                  onChange={e => setField('domainId', e.target.value)}
                  className="w-full text-sm border border-black/20 rounded-lg px-3 py-2 outline-none focus:border-black bg-white"
                >
                  <option value="">— none —</option>
                  {domains.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => addMutation.mutate()}
              disabled={!form.email || addMutation.isPending}
              className="bg-black text-white text-xs px-4 py-2 rounded-lg hover:bg-black/80 disabled:opacity-50 transition-colors"
            >
              {addMutation.isPending ? 'Adding…' : 'Add Account'}
            </button>
            <button onClick={() => { setShowAdd(false); setForm(EMPTY_FORM); }} className="text-xs text-black/40 px-2 hover:text-black">Cancel</button>
          </div>
          {addMutation.isError && (
            <p className="text-xs text-black/50">Error: {(addMutation.error as Error).message}</p>
          )}
        </div>
      )}

      {/* Account list */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
          </div>
        )}
        {!isLoading && accounts.length === 0 && !showAdd && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Mail size={32} className="text-black/20 mb-3" />
            <p className="text-sm font-medium text-black/40">No accounts yet</p>
            <p className="text-xs text-black/30 mt-1">Add an email account to start syncing mail</p>
          </div>
        )}
        {accounts.map(acc => (
          <div key={acc.id} className="flex items-center gap-3 border border-black/10 rounded-xl px-4 py-3">
            <div className="w-9 h-9 rounded-full bg-black flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-semibold">{acc.email[0].toUpperCase()}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-black truncate">{acc.email}</p>
                {!acc.enabled && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-black/5 text-black/30 rounded font-medium">Disabled</span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                {acc.imapHost && (
                  <span className="flex items-center gap-1 text-xs text-black/30">
                    <Server size={10} />{acc.imapHost}
                  </span>
                )}
                {acc.lastSyncedAt && (
                  <span className="text-xs text-black/30">
                    Synced {new Date(acc.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleMutation.mutate({ id: acc.id, enabled: !acc.enabled })}
                className="text-black/40 hover:text-black transition-colors"
              >
                {acc.enabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
              </button>
              <button
                onClick={() => deleteMutation.mutate(acc.id)}
                className="p-1.5 text-black/30 hover:text-black rounded transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
