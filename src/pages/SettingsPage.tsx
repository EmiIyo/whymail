import { useState } from 'react';
import { User, Bell, Shield, Server, Save, KeyRound, ShieldCheck } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { profilesApi, accountsApi } from '@/api/index';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

type Tab = 'profile' | 'notifications' | 'server' | 'security';

const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'profile', label: 'Profile', icon: <User size={14} /> },
  { key: 'notifications', label: 'Notifications', icon: <Bell size={14} /> },
  { key: 'server', label: 'Server', icon: <Server size={14} /> },
  { key: 'security', label: 'Security', icon: <Shield size={14} /> },
];

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [name, setName] = useState('');
  const [notifyNewMail, setNotifyNewMail] = useState(true);
  const [notifyMentions, setNotifyMentions] = useState(true);
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [newPwdConfirm, setNewPwdConfirm] = useState('');
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [recoveryDraft, setRecoveryDraft] = useState<Record<string, string>>({});
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  // Load profile
  useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const p = await profilesApi.get(user.id);
      setName(p.fullName ?? user.email?.split('@')[0] ?? '');
      setNotifyNewMail(p.notifyNewMail);
      setNotifyMentions(p.notifyMentions);
      return p;
    },
    enabled: !!user,
  });

  const notificationMutation = useMutation({
    mutationFn: (prefs: { notifyNewMail?: boolean; notifyMentions?: boolean }) =>
      profilesApi.updateNotifications(user!.id, prefs),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile'] }),
    onError: (err: Error) => toast({ title: 'Could not save preference', description: err.message, variant: 'destructive' }),
  });

  const saveMutation = useMutation({
    mutationFn: () => profilesApi.update(user!.id, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile'] });
      toast({ title: 'Settings saved', description: 'Your profile has been updated.' });
    },
  });

  const passwordMutation = useMutation({
    mutationFn: async () => {
      setPwdError(null);
      if (!user?.email) throw new Error('No active session');
      if (!currentPwd) throw new Error('Enter your current password');
      if (newPwd.length < 8) throw new Error('New password must be at least 8 characters');
      if (newPwd !== newPwdConfirm) throw new Error('Passwords do not match');
      // Verify current password by attempting a sign-in. supabase-js refreshes
      // the session on success but it's the same user, so subsequent calls
      // continue to work with the same identity.
      const { error: verifyErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPwd,
      });
      if (verifyErr) throw new Error('Current password is incorrect');
      const { error } = await supabase.auth.updateUser({ password: newPwd });
      if (error) throw new Error(error.message);
      const { error: confirmErr } = await supabase.functions.invoke('confirm-password-change');
      if (confirmErr) console.warn('confirm-password-change failed:', confirmErr);
    },
    onSuccess: () => {
      setCurrentPwd('');
      setNewPwd('');
      setNewPwdConfirm('');
      qc.invalidateQueries({ queryKey: ['must-change-password'] });
      toast({ title: 'Password updated', description: 'Use the new password for your next sign-in.' });
    },
    onError: (err: Error) => setPwdError(err.message),
  });

  // Mailboxes the current user OWNS — they can edit recovery email on these.
  const { data: ownMailboxes = [] } = useQuery({
    queryKey: ['own-mailboxes', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const all = await accountsApi.list();
      return all.filter((a) => a.ownerUserId === user?.id);
    },
  });

  const recoveryMutation = useMutation({
    mutationFn: async ({ mailboxId, recoveryEmail }: { mailboxId: string; recoveryEmail: string | null }) => {
      setRecoveryError(null);
      await accountsApi.update(mailboxId, { recoveryEmail });
    },
    onSuccess: (_d, { mailboxId }) => {
      qc.invalidateQueries({ queryKey: ['own-mailboxes'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['missing-recovery'] });
      setRecoveryDraft((d) => { const n = { ...d }; delete n[mailboxId]; return n; });
      toast({ title: 'Recovery email saved' });
    },
    onError: (err: Error) => setRecoveryError(err.message),
  });

  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="max-w-2xl mx-auto px-6 py-6">
        <h1 className="text-base font-semibold text-black mb-6">Settings</h1>

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-black/10 mb-6">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px ${
                activeTab === tab.key
                  ? 'border-black text-black'
                  : 'border-transparent text-black/40 hover:text-black/70'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Profile */}
        {activeTab === 'profile' && (
          <div className="space-y-4">
            <div className="border border-black/10 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-black mb-4">Personal Information</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-black/50 uppercase tracking-wide mb-1.5 block">Display Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full text-sm border border-black/20 rounded-lg px-3 py-2 outline-none focus:border-black bg-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-black/50 uppercase tracking-wide mb-1.5 block">Email</label>
                  <input
                    type="text"
                    value={user?.email ?? ''}
                    disabled
                    className="w-full text-sm border border-black/10 rounded-lg px-3 py-2 bg-black/[0.02] text-black/50 cursor-not-allowed"
                  />
                </div>
                <button
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                  className="flex items-center gap-2 bg-black text-white text-xs font-medium px-4 py-2 rounded-lg hover:bg-black/80 disabled:opacity-50 transition-colors"
                >
                  <Save size={12} /> {saveMutation.isPending ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Notifications */}
        {activeTab === 'notifications' && (
          <div className="border border-black/10 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-black mb-4">Notification Preferences</h2>
            <div className="space-y-4">
              <ToggleRow
                label="New email"
                desc="Show a desktop notification when a new mail arrives in any of your inboxes."
                checked={notifyNewMail}
                onChange={(v) => { setNotifyNewMail(v); notificationMutation.mutate({ notifyNewMail: v }); }}
                disabled={notificationMutation.isPending}
              />
              <ToggleRow
                label="Mentions"
                desc="Notify when an incoming mail addresses you directly (To/CC includes your address)."
                checked={notifyMentions}
                onChange={(v) => { setNotifyMentions(v); notificationMutation.mutate({ notifyMentions: v }); }}
                disabled={notificationMutation.isPending}
              />
            </div>
          </div>
        )}

        {/* Server */}
        {activeTab === 'server' && (
          <div className="border border-black/10 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-black mb-2">Mail infrastructure</h2>
            <p className="text-xs text-black/40 mb-4">Inbound is delivered by Cloudflare Email Routing into a Worker that webhook-posts to the Supabase receive-email function. Outbound is sent through Resend.</p>
            <div className="p-4 bg-black/[0.02] rounded-lg space-y-1">
              <p className="text-xs font-mono text-black/60">Provider in: Cloudflare Email Routing</p>
              <p className="text-xs font-mono text-black/60">Provider out: Resend (api.resend.com)</p>
              <p className="text-xs font-mono text-black/60">Storage: Supabase Postgres + private Storage bucket</p>
            </div>
          </div>
        )}

        {/* Security */}
        {activeTab === 'security' && (
          <div className="space-y-4">
            <div className="border border-black/10 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-black mb-4 flex items-center gap-2">
                <KeyRound size={14} /> Change password
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-black/50 uppercase tracking-wide mb-1.5 block">Current password</label>
                  <input
                    type="password"
                    value={currentPwd}
                    onChange={(e) => setCurrentPwd(e.target.value)}
                    placeholder="Your existing password"
                    className="w-full text-sm border border-black/20 rounded-lg px-3 py-2 outline-none focus:border-black bg-white"
                    autoComplete="current-password"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-black/50 uppercase tracking-wide mb-1.5 block">New password</label>
                  <input
                    type="password"
                    value={newPwd}
                    onChange={(e) => setNewPwd(e.target.value)}
                    placeholder="Min 8 characters"
                    className="w-full text-sm border border-black/20 rounded-lg px-3 py-2 outline-none focus:border-black bg-white"
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-black/50 uppercase tracking-wide mb-1.5 block">Confirm password</label>
                  <input
                    type="password"
                    value={newPwdConfirm}
                    onChange={(e) => setNewPwdConfirm(e.target.value)}
                    placeholder="Repeat the new password"
                    className="w-full text-sm border border-black/20 rounded-lg px-3 py-2 outline-none focus:border-black bg-white"
                    autoComplete="new-password"
                  />
                </div>
                {pwdError && <p className="text-xs text-red-600">{pwdError}</p>}
                <button
                  onClick={() => passwordMutation.mutate()}
                  disabled={passwordMutation.isPending || !currentPwd || !newPwd || !newPwdConfirm}
                  className="bg-black text-white text-xs font-medium px-4 py-2 rounded-lg hover:bg-black/80 disabled:opacity-50 transition-colors"
                >
                  {passwordMutation.isPending ? 'Updating…' : 'Update password'}
                </button>
              </div>
            </div>

            {ownMailboxes.length > 0 && (
              <div className="border border-black/10 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-black mb-1 flex items-center gap-2">
                  <ShieldCheck size={14} /> Recovery email
                </h2>
                <p className="text-xs text-black/50 mb-4">
                  Where the password reset link is sent if you forget your password.
                </p>
                <div className="space-y-3">
                  {ownMailboxes.map((mb) => {
                    const draftValue = recoveryDraft[mb.id];
                    const value = draftValue !== undefined ? draftValue : (mb.recoveryEmail ?? '');
                    const isDirty = draftValue !== undefined && draftValue !== (mb.recoveryEmail ?? '');
                    return (
                      <div key={mb.id} className="flex items-center gap-2">
                        <div className="flex-1">
                          <p className="text-xs text-black/50 mb-1">{mb.email}</p>
                          <input
                            type="email"
                            value={value}
                            onChange={(e) => setRecoveryDraft((d) => ({ ...d, [mb.id]: e.target.value }))}
                            placeholder="personal@gmail.com"
                            className="w-full text-sm border border-black/20 rounded-lg px-3 py-2 outline-none focus:border-black bg-white"
                          />
                        </div>
                        <button
                          onClick={() => recoveryMutation.mutate({
                            mailboxId: mb.id,
                            recoveryEmail: value.trim() || null,
                          })}
                          disabled={!isDirty || recoveryMutation.isPending}
                          className="bg-black text-white text-xs px-3 py-2 rounded-lg mt-5 hover:bg-black/80 disabled:opacity-30 transition-colors shrink-0"
                        >
                          Save
                        </button>
                      </div>
                    );
                  })}
                  {recoveryError && <p className="text-xs text-red-600">{recoveryError}</p>}
                </div>
              </div>
            )}

            <div className="border border-black/10 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-black mb-4">Account session</h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium text-black">Signed in as</p>
                    <p className="text-xs text-black/40">{user?.email}</p>
                  </div>
                  <span className="text-[10px] px-2 py-1 bg-black text-white rounded font-medium">Active</span>
                </div>
                <div className="border-t border-black/5 pt-3">
                  <button
                    onClick={signOut}
                    className="text-sm text-black/60 hover:text-black underline underline-offset-2 transition-colors"
                  >
                    Sign out of all devices
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface ToggleRowProps {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

function ToggleRow({ label, desc, checked, onChange, disabled }: ToggleRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-black">{label}</p>
        <p className="text-xs text-black/50 mt-0.5 leading-snug">{desc}</p>
      </div>
      <button
        type="button"
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        aria-pressed={checked}
        className={`relative shrink-0 w-11 h-6 rounded-full transition-colors duration-200 disabled:opacity-50 ${
          checked ? 'bg-black' : 'bg-black/15'
        }`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${
            checked ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}
