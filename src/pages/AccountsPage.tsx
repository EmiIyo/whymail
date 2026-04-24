import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Mail, Trash2, ToggleLeft, ToggleRight, Globe } from 'lucide-react';
import { accountsApi, domainsApi } from '@/api/index';
import { useAuth } from '@/hooks/useAuth';

interface NewAccountForm {
  localPart: string;
  displayName: string;
  domainId: string;
}

const EMPTY_FORM: NewAccountForm = { localPart: '', displayName: '', domainId: '' };

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

  const selectedDomain = domains.find((d) => d.id === form.domainId);

  const addMutation = useMutation({
    mutationFn: () => {
      if (!form.domainId || !selectedDomain) throw new Error('Please pick a domain');
      if (!form.localPart.trim()) throw new Error('Enter a mailbox name (the part before @)');
      const email = `${form.localPart.trim().toLowerCase()}@${selectedDomain.name}`;
      return accountsApi.create({
        userId: user!.id,
        email,
        displayName: form.displayName,
        domainId: form.domainId,
      });
    },
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

  const setField = (k: keyof NewAccountForm, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const hasDomains = domains.length > 0;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white">
      <div className="flex items-center justify-between px-6 py-4 border-b border-black/10">
        <div>
          <h1 className="text-base font-semibold text-black">Mailboxes</h1>
          <p className="text-xs text-black/40 mt-0.5">Create addresses on your own domains</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          disabled={!hasDomains}
          className="flex items-center gap-2 bg-black text-white text-xs font-medium px-3 py-2 rounded-lg hover:bg-black/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus size={14} /> New Mailbox
        </button>
      </div>

      {!hasDomains && (
        <div className="mx-6 mt-4 p-4 border border-black/10 rounded-xl bg-black/[0.02] text-xs text-black/60">
          Add a verified domain first on the <span className="font-semibold">Domains</span> page. A mailbox always belongs to one of your domains.
        </div>
      )}

      {showAdd && hasDomains && (
        <div className="mx-6 mt-4 p-4 border border-black/10 rounded-xl bg-black/[0.02] space-y-3">
          <p className="text-xs font-semibold text-black">New mailbox</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-medium text-black/50 uppercase tracking-wide mb-1 block">Domain</label>
              <select
                value={form.domainId}
                onChange={(e) => setField('domainId', e.target.value)}
                className="w-full text-sm border border-black/20 rounded-lg px-3 py-2 outline-none focus:border-black bg-white"
              >
                <option value="">— pick a domain —</option>
                {domains.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}{d.verified ? '' : ' (unverified)'}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-medium text-black/50 uppercase tracking-wide mb-1 block">Address</label>
              <div className="flex items-center border border-black/20 rounded-lg overflow-hidden focus-within:border-black">
                <input
                  type="text"
                  value={form.localPart}
                  onChange={(e) => setField('localPart', e.target.value)}
                  placeholder="admin"
                  className="flex-1 text-sm px-3 py-2 outline-none bg-white"
                />
                <span className="text-sm text-black/50 pr-3 select-none">
                  @{selectedDomain?.name ?? 'domain'}
                </span>
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="text-[10px] font-medium text-black/50 uppercase tracking-wide mb-1 block">Display name (optional)</label>
              <input
                type="text"
                value={form.displayName}
                onChange={(e) => setField('displayName', e.target.value)}
                placeholder="Emrecan"
                className="w-full text-sm border border-black/20 rounded-lg px-3 py-2 outline-none focus:border-black bg-white"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => addMutation.mutate()}
              disabled={addMutation.isPending || !form.domainId || !form.localPart.trim()}
              className="bg-black text-white text-xs px-4 py-2 rounded-lg hover:bg-black/80 disabled:opacity-50 transition-colors"
            >
              {addMutation.isPending ? 'Creating…' : 'Create mailbox'}
            </button>
            <button
              onClick={() => { setShowAdd(false); setForm(EMPTY_FORM); }}
              className="text-xs text-black/40 px-2 hover:text-black"
            >
              Cancel
            </button>
          </div>
          {addMutation.isError && (
            <p className="text-xs text-red-600">Error: {(addMutation.error as Error).message}</p>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
          </div>
        )}
        {!isLoading && accounts.length === 0 && !showAdd && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Mail size={32} className="text-black/20 mb-3" />
            <p className="text-sm font-medium text-black/40">No mailboxes yet</p>
            <p className="text-xs text-black/30 mt-1">
              {hasDomains ? 'Create your first mailbox to start sending and receiving.' : 'Add a domain on the Domains page first.'}
            </p>
          </div>
        )}
        {accounts.map((acc) => (
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
                {acc.name && acc.name !== acc.email && (
                  <span className="text-xs text-black/40">{acc.name}</span>
                )}
                <span className="flex items-center gap-1 text-xs text-black/30">
                  <Globe size={10} />
                  {acc.email.split('@')[1]}
                </span>
                {acc.lastActivityAt && (
                  <span className="text-xs text-black/30">
                    Last activity {new Date(acc.lastActivityAt).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleMutation.mutate({ id: acc.id, enabled: !acc.enabled })}
                className="text-black/40 hover:text-black transition-colors"
                title={acc.enabled ? 'Disable (stop receiving)' : 'Enable'}
              >
                {acc.enabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
              </button>
              <button
                onClick={() => deleteMutation.mutate(acc.id)}
                className="p-1.5 text-black/30 hover:text-red-600 rounded transition-colors"
                title="Delete mailbox"
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
