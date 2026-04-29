import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Mail, Trash2, ToggleLeft, ToggleRight, Globe, KeyRound, X, AlertCircle, ShieldCheck, Pencil, AtSign, Shield } from 'lucide-react';
import { accountsApi, domainsApi, aliasesApi, domainAdminsApi } from '@/api/index';
import { useAuth } from '@/hooks/useAuth';
import type { EmailAccount } from '@/lib/index';

interface NewMailboxForm {
  localPart: string;
  displayName: string;
  domainId: string;
  forSelf: boolean;
  password: string;
  passwordConfirm: string;
  recoveryEmail: string;
}

const EMPTY_FORM: NewMailboxForm = {
  localPart: '', displayName: '', domainId: '',
  forSelf: true, password: '', passwordConfirm: '', recoveryEmail: '',
};

export default function AccountsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<NewMailboxForm>(EMPTY_FORM);
  const [resetTarget, setResetTarget] = useState<EmailAccount | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<EmailAccount | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editRecovery, setEditRecovery] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [aliasTarget, setAliasTarget] = useState<EmailAccount | null>(null);

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

  const myMailboxes = accounts.filter((a) => a.ownerUserId === user?.id);
  const managedMailboxes = accounts.filter(
    (a) => a.createdByUserId === user?.id && a.ownerUserId !== user?.id,
  );

  const selectedDomain = domains.find((d) => d.id === form.domainId);

  const addMutation = useMutation({
    mutationFn: () => {
      if (!form.domainId) throw new Error('Pick a domain');
      if (!form.localPart.trim()) throw new Error('Mailbox name required');
      if (!form.forSelf) {
        if (form.password.length < 8) throw new Error('Password must be at least 8 characters');
        if (form.password !== form.passwordConfirm) throw new Error('Passwords do not match');
      }
      return accountsApi.create({
        domainId: form.domainId,
        localPart: form.localPart,
        displayName: form.displayName,
        forSelf: form.forSelf,
        password: form.forSelf ? undefined : form.password,
        recoveryEmail: form.recoveryEmail.trim() || undefined,
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

  const resetMutation = useMutation({
    mutationFn: ({ mailboxId, newPassword }: { mailboxId: string; newPassword: string }) =>
      accountsApi.resetPassword(mailboxId, newPassword),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      setResetTarget(null);
      setResetPassword('');
      setResetConfirm('');
      setResetError(null);
    },
    onError: (err: Error) => setResetError(err.message),
  });

  const editMutation = useMutation({
    mutationFn: ({ mailboxId, displayName, recoveryEmail }: { mailboxId: string; displayName: string | null; recoveryEmail: string | null }) =>
      accountsApi.update(mailboxId, { displayName, recoveryEmail }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['own-mailboxes'] });
      setEditTarget(null);
      setEditDisplayName('');
      setEditRecovery('');
      setEditError(null);
    },
    onError: (err: Error) => setEditError(err.message),
  });

  const setField = <K extends keyof NewMailboxForm>(k: K, v: NewMailboxForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submitReset = () => {
    setResetError(null);
    if (resetPassword.length < 8) { setResetError('Password must be at least 8 characters'); return; }
    if (resetPassword !== resetConfirm) { setResetError('Passwords do not match'); return; }
    if (!resetTarget) return;
    resetMutation.mutate({ mailboxId: resetTarget.id, newPassword: resetPassword });
  };

  const hasDomains = domains.length > 0;

  const Mailbox = ({ acc, isManaged }: { acc: EmailAccount; isManaged: boolean }) => (
    <div key={acc.id} className="flex items-center gap-3 border border-black/10 rounded-xl px-4 py-3">
      <div className="w-9 h-9 rounded-full bg-black flex items-center justify-center shrink-0">
        <span className="text-white text-xs font-semibold">{acc.email[0].toUpperCase()}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-black truncate">{acc.email}</p>
          {!acc.enabled && <span className="text-[10px] px-1.5 py-0.5 bg-black/5 text-black/40 rounded font-medium">Disabled</span>}
          {acc.mustChangePassword && (
            <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-medium">
              Pending password change
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          {acc.name && acc.name !== acc.email && (
            <span className="text-xs text-black/40">{acc.name}</span>
          )}
          <span className="flex items-center gap-1 text-xs text-black/30">
            <Globe size={10} />
            {acc.email.split('@')[1]}
          </span>
          {acc.recoveryEmail ? (
            <span className="flex items-center gap-1 text-xs text-emerald-600">
              <ShieldCheck size={10} />
              Recovery: {acc.recoveryEmail}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-amber-600">
              <AlertCircle size={10} />
              No recovery email
            </span>
          )}
          {acc.lastActivityAt && (
            <span className="text-xs text-black/30">
              Last activity {new Date(acc.lastActivityAt).toLocaleString()}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {/* Aliases only available on for-self mailboxes (owner == creator) */}
        {acc.ownerUserId === acc.createdByUserId && acc.ownerUserId === user?.id && (
          <button
            onClick={() => setAliasTarget(acc)}
            className="p-1.5 text-black/40 hover:text-black rounded transition-colors"
            title="Manage aliases"
          >
            <AtSign size={14} />
          </button>
        )}
        {/* Grant/revoke domain admin — only on end-user mailboxes that the current user manages */}
        {isManaged && acc.ownerUserId !== acc.createdByUserId && acc.domainId && (
          <DomainAdminToggle account={acc} />
        )}
        <button
          onClick={() => {
            setEditTarget(acc);
            setEditDisplayName(acc.name && acc.name !== acc.email ? acc.name : '');
            setEditRecovery(acc.recoveryEmail ?? '');
            setEditError(null);
          }}
          className="p-1.5 text-black/40 hover:text-black rounded transition-colors"
          title="Edit display name & recovery email"
        >
          <Pencil size={14} />
        </button>
        {isManaged && (
          <button
            onClick={() => { setResetTarget(acc); setResetPassword(''); setResetConfirm(''); setResetError(null); }}
            className="p-1.5 text-black/40 hover:text-black rounded transition-colors"
            title="Reset password"
          >
            <KeyRound size={14} />
          </button>
        )}
        <button
          onClick={() => toggleMutation.mutate({ id: acc.id, enabled: !acc.enabled })}
          className="text-black/40 hover:text-black transition-colors"
          title={acc.enabled ? 'Disable (stops receiving)' : 'Enable'}
        >
          {acc.enabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
        </button>
        <button
          onClick={() => {
            const label = isManaged ? `Delete mailbox ${acc.email} and revoke its login?` : `Delete mailbox ${acc.email}?`;
            if (window.confirm(label)) deleteMutation.mutate(acc.id);
          }}
          className="p-1.5 text-black/30 hover:text-red-600 rounded transition-colors"
          title="Delete mailbox"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-black/10 bg-white">
        <div>
          <h1 className="text-base font-semibold text-black">Mailboxes</h1>
          <p className="text-xs text-black/40 mt-0.5">Create addresses on your own domains and manage who can use them</p>
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
          Add a verified domain first on the <span className="font-semibold">Domains</span> page.
        </div>
      )}

      {showAdd && hasDomains && (
        <div className="mx-6 mt-4 p-4 border border-black/10 rounded-xl bg-black/[0.02] space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-black">New mailbox</p>
            <button onClick={() => { setShowAdd(false); setForm(EMPTY_FORM); }} className="text-black/30 hover:text-black"><X size={14} /></button>
          </div>

          <div className="flex gap-2 text-xs">
            <button
              onClick={() => setField('forSelf', true)}
              className={`flex-1 px-3 py-2 rounded-lg border transition-colors ${form.forSelf ? 'border-black bg-black text-white' : 'border-black/15 text-black/60 hover:border-black/30'}`}
            >
              For myself
            </button>
            <button
              onClick={() => setField('forSelf', false)}
              className={`flex-1 px-3 py-2 rounded-lg border transition-colors ${!form.forSelf ? 'border-black bg-black text-white' : 'border-black/15 text-black/60 hover:border-black/30'}`}
            >
              For someone else
            </button>
          </div>

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
                placeholder='e.g. "Petbook Support"'
                className="w-full text-sm border border-black/20 rounded-lg px-3 py-2 outline-none focus:border-black bg-white"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-[10px] font-medium text-black/50 uppercase tracking-wide mb-1 block">
                Recovery email <span className="text-black/30 normal-case font-normal">(optional, used for password reset)</span>
              </label>
              <input
                type="email"
                value={form.recoveryEmail}
                onChange={(e) => setField('recoveryEmail', e.target.value)}
                placeholder={form.forSelf ? 'your-personal@gmail.com' : "user's personal gmail / outlook"}
                className="w-full text-sm border border-black/20 rounded-lg px-3 py-2 outline-none focus:border-black bg-white"
              />
              <p className="text-[10px] text-black/40 mt-1 leading-relaxed">
                {form.forSelf
                  ? 'Optional. Without one, your only way back into this mailbox if you forget the password is the recovery email on your main account.'
                  : 'Without one, the user cannot reset their own password — you (the admin) will need to reset it for them.'}
              </p>
            </div>

            {!form.forSelf && (
              <>
                <div>
                  <label className="text-[10px] font-medium text-black/50 uppercase tracking-wide mb-1 block">Initial password</label>
                  <input
                    type="text"
                    value={form.password}
                    onChange={(e) => setField('password', e.target.value)}
                    placeholder="Min 8 characters"
                    className="w-full text-sm border border-black/20 rounded-lg px-3 py-2 outline-none focus:border-black bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-black/50 uppercase tracking-wide mb-1 block">Confirm password</label>
                  <input
                    type="text"
                    value={form.passwordConfirm}
                    onChange={(e) => setField('passwordConfirm', e.target.value)}
                    placeholder="Repeat the password"
                    className="w-full text-sm border border-black/20 rounded-lg px-3 py-2 outline-none focus:border-black bg-white font-mono"
                  />
                </div>
                <div className="md:col-span-2 text-xs text-black/50 leading-relaxed bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
                  <AlertCircle size={14} className="shrink-0 mt-0.5 text-amber-600" />
                  <span>
                    Share these credentials with the user out of band (Slack/WhatsApp). They will be required to change the password on first login.
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => addMutation.mutate()}
              disabled={addMutation.isPending}
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

      <div className="px-6 py-4 space-y-6 pb-24 lg:pb-6">
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
              {hasDomains ? 'Create your first mailbox to start sending and receiving.' : 'Add a domain first.'}
            </p>
          </div>
        )}

        {myMailboxes.length > 0 && (
          <section>
            <h2 className="text-[11px] uppercase tracking-wide text-black/40 font-semibold mb-2">My mailboxes</h2>
            <div className="space-y-2">
              {myMailboxes.map((acc) => (
                <Mailbox key={acc.id} acc={acc} isManaged={acc.createdByUserId === user?.id} />
              ))}
            </div>
          </section>
        )}

        {managedMailboxes.length > 0 && (
          <section>
            <h2 className="text-[11px] uppercase tracking-wide text-black/40 font-semibold mb-2">
              Mailboxes I manage ({managedMailboxes.length})
            </h2>
            <div className="space-y-2">
              {managedMailboxes.map((acc) => (
                <Mailbox key={acc.id} acc={acc} isManaged={true} />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Edit dialog: display name + recovery email */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-black">Edit {editTarget.email}</h2>
              <button onClick={() => setEditTarget(null)} className="text-black/30 hover:text-black"><X size={16} /></button>
            </div>
            <div>
              <label className="text-[10px] font-medium text-black/50 uppercase tracking-wide mb-1 block">Display name</label>
              <input
                type="text"
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                placeholder='e.g. "Petbook Support"'
                className="w-full text-sm border border-black/20 rounded-lg px-3 py-2 outline-none focus:border-black bg-white"
                autoFocus
              />
              <p className="text-[10px] text-black/40 mt-1">Shown next to the address in recipient inboxes (Gmail, Outlook, etc.).</p>
            </div>
            <div>
              <label className="text-[10px] font-medium text-black/50 uppercase tracking-wide mb-1 block">Recovery email</label>
              <input
                type="email"
                value={editRecovery}
                onChange={(e) => setEditRecovery(e.target.value)}
                placeholder="user-personal@gmail.com"
                className="w-full text-sm border border-black/20 rounded-lg px-3 py-2 outline-none focus:border-black bg-white"
              />
              <p className="text-[10px] text-black/40 mt-1">Where the password reset link is sent. Leave blank to disable self-service recovery.</p>
            </div>
            {editError && <p className="text-xs text-red-600">{editError}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditTarget(null)} className="text-xs text-black/50 px-3 py-2 hover:text-black">
                Cancel
              </button>
              <button
                onClick={() => editMutation.mutate({
                  mailboxId: editTarget.id,
                  displayName: editDisplayName.trim() || null,
                  recoveryEmail: editRecovery.trim() || null,
                })}
                disabled={editMutation.isPending}
                className="bg-black text-white text-xs px-4 py-2 rounded-lg hover:bg-black/80 disabled:opacity-50 transition-colors"
              >
                {editMutation.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Aliases dialog */}
      {aliasTarget && (
        <AliasesDialog
          mailbox={aliasTarget}
          onClose={() => setAliasTarget(null)}
        />
      )}

      {/* Reset password dialog */}
      {resetTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-black">Reset password for {resetTarget.email}</h2>
              <button onClick={() => setResetTarget(null)} className="text-black/30 hover:text-black"><X size={16} /></button>
            </div>
            <p className="text-xs text-black/50">
              The user will be required to change this on their next login.
            </p>
            <div>
              <label className="text-[10px] font-medium text-black/50 uppercase tracking-wide mb-1 block">New password</label>
              <input
                type="text"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                placeholder="Min 8 characters"
                className="w-full text-sm border border-black/20 rounded-lg px-3 py-2 outline-none focus:border-black bg-white font-mono"
                autoFocus
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-black/50 uppercase tracking-wide mb-1 block">Confirm</label>
              <input
                type="text"
                value={resetConfirm}
                onChange={(e) => setResetConfirm(e.target.value)}
                placeholder="Repeat the password"
                className="w-full text-sm border border-black/20 rounded-lg px-3 py-2 outline-none focus:border-black bg-white font-mono"
              />
            </div>
            {resetError && <p className="text-xs text-red-600">{resetError}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setResetTarget(null)} className="text-xs text-black/50 px-3 py-2 hover:text-black">
                Cancel
              </button>
              <button
                onClick={submitReset}
                disabled={resetMutation.isPending}
                className="bg-black text-white text-xs px-4 py-2 rounded-lg hover:bg-black/80 disabled:opacity-50 transition-colors"
              >
                {resetMutation.isPending ? 'Resetting…' : 'Reset password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Domain admin toggle (per end-user mailbox) ──────────────
function DomainAdminToggle({ account }: { account: EmailAccount }) {
  const qc = useQueryClient();
  const { data: admins = [], isLoading } = useQuery({
    queryKey: ['domain-admins', account.domainId],
    queryFn: () => domainAdminsApi.list(account.domainId),
    enabled: !!account.domainId,
  });
  const isAdmin = admins.some((a) => a.userId === account.ownerUserId);

  const grantMutation = useMutation({
    mutationFn: () => domainAdminsApi.add(account.domainId, account.email),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['domain-admins', account.domainId] }),
  });
  const revokeMutation = useMutation({
    mutationFn: () => domainAdminsApi.remove(account.domainId, account.ownerUserId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['domain-admins', account.domainId] }),
  });

  const pending = grantMutation.isPending || revokeMutation.isPending || isLoading;

  return (
    <button
      onClick={() => {
        if (pending) return;
        if (isAdmin) {
          if (window.confirm(`Revoke domain admin access from ${account.email}?`)) revokeMutation.mutate();
        } else {
          if (window.confirm(`Grant ${account.email} full domain management access?`)) grantMutation.mutate();
        }
      }}
      disabled={pending}
      className={`p-1.5 rounded transition-colors ${
        isAdmin ? 'text-emerald-600 hover:text-emerald-700' : 'text-black/30 hover:text-black'
      } disabled:opacity-50`}
      title={isAdmin ? 'Revoke domain admin' : 'Grant domain admin (lets this user manage the domain)'}
    >
      <Shield size={14} className={isAdmin ? 'fill-emerald-600/15' : ''} />
    </button>
  );
}

// ─── Aliases dialog ──────────────────────────────────────────
interface AliasesDialogProps {
  mailbox: EmailAccount;
  onClose: () => void;
}

function AliasesDialog({ mailbox, onClose }: AliasesDialogProps) {
  const qc = useQueryClient();
  const domainPart = mailbox.email.split('@')[1] ?? '';
  const [newLocal, setNewLocal] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const { data: aliases = [], isLoading } = useQuery({
    queryKey: ['aliases', mailbox.id],
    queryFn: () => aliasesApi.list(mailbox.id),
  });

  const addMutation = useMutation({
    mutationFn: () => {
      setError(null);
      if (!newLocal.trim()) throw new Error('Enter the part before @');
      return aliasesApi.add({
        mailboxId: mailbox.id,
        localPart: newLocal,
        displayName: newDisplayName.trim() || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['aliases', mailbox.id] });
      setNewLocal('');
      setNewDisplayName('');
    },
    onError: (err: Error) => setError(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string | null }) =>
      aliasesApi.update(id, { displayName: name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['aliases', mailbox.id] });
      setEditingId(null);
    },
    onError: (err: Error) => setError(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => aliasesApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['aliases', mailbox.id] }),
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-black">Aliases for {mailbox.email}</h2>
            <p className="text-[11px] text-black/50 mt-0.5">Other addresses that deliver to this inbox</p>
          </div>
          <button onClick={onClose} className="text-black/30 hover:text-black"><X size={16} /></button>
        </div>

        <div className="border border-black/10 rounded-xl divide-y divide-black/5">
          {isLoading && <div className="px-3 py-3 text-xs text-black/40">Loading…</div>}
          {!isLoading && aliases.length === 0 && (
            <div className="px-3 py-3 text-[11px] text-black/40">
              No aliases yet. Add one below — mail to that address will arrive in this inbox.
            </div>
          )}
          {aliases.map((a) => (
            <div key={a.id} className="px-3 py-2.5 flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-black/5 flex items-center justify-center shrink-0">
                <AtSign size={12} className="text-black/40" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-black truncate">{a.aliasEmail}</p>
                {editingId === a.id ? (
                  <div className="flex gap-1 mt-1">
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      placeholder="Display name (e.g. Petbook Support)"
                      className="flex-1 text-xs border border-black/15 rounded px-2 py-1 outline-none focus:border-black"
                      autoFocus
                    />
                    <button
                      onClick={() => updateMutation.mutate({ id: a.id, name: editingName.trim() || null })}
                      className="text-xs bg-black text-white px-2 rounded"
                    >Save</button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-xs text-black/50 px-1"
                    >×</button>
                  </div>
                ) : (
                  <p className="text-[10px] text-black/40 truncate">
                    {a.displayName ? `Display name: ${a.displayName}` : 'No display name override'}
                  </p>
                )}
              </div>
              {editingId !== a.id && (
                <>
                  <button
                    onClick={() => { setEditingId(a.id); setEditingName(a.displayName ?? ''); setError(null); }}
                    className="p-1.5 text-black/40 hover:text-black rounded transition-colors"
                    title="Edit display name"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`Remove alias ${a.aliasEmail}?`)) removeMutation.mutate(a.id);
                    }}
                    disabled={removeMutation.isPending}
                    className="p-1.5 text-black/30 hover:text-red-600 rounded transition-colors"
                    title="Remove"
                  >
                    <Trash2 size={12} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-black/10 pt-3 space-y-2">
          <p className="text-xs font-semibold text-black">Add new alias</p>
          <div className="flex items-center border border-black/15 rounded-lg overflow-hidden focus-within:border-black">
            <input
              type="text"
              value={newLocal}
              onChange={(e) => setNewLocal(e.target.value)}
              placeholder="e.g. info"
              className="flex-1 text-sm px-3 py-2 outline-none bg-white"
            />
            <span className="text-sm text-black/50 pr-3 select-none">@{domainPart}</span>
          </div>
          <input
            type="text"
            value={newDisplayName}
            onChange={(e) => setNewDisplayName(e.target.value)}
            placeholder="Display name (optional, e.g. Petbook Support)"
            className="w-full text-sm border border-black/15 rounded-lg px-3 py-2 outline-none focus:border-black bg-white"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => addMutation.mutate()}
              disabled={addMutation.isPending || !newLocal.trim()}
              className="bg-black text-white text-xs px-4 py-2 rounded-lg hover:bg-black/80 disabled:opacity-50 transition-colors"
            >
              {addMutation.isPending ? 'Adding…' : 'Add alias'}
            </button>
            <button onClick={onClose} className="text-xs text-black/50 px-2 hover:text-black">Done</button>
          </div>
        </div>
      </div>
    </div>
  );
}
