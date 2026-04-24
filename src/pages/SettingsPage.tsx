import { useState } from 'react';
import { User, Bell, Shield, Server, Save } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { profilesApi } from '@/api/index';
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
  const [notifications, setNotifications] = useState({ newMail: true, mentions: true, digest: false });

  // Load profile
  useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const p = await profilesApi.get(user.id);
      setName(p.fullName ?? user.email?.split('@')[0] ?? '');
      return p;
    },
    enabled: !!user,
  });

  const saveMutation = useMutation({
    mutationFn: () => profilesApi.update(user!.id, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile'] });
      toast({ title: 'Settings saved', description: 'Your profile has been updated.' });
    },
  });

  return (
    <div className="flex-1 overflow-y-auto bg-white">
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
              {[
                { key: 'newMail' as const, label: 'New email', desc: 'Alert when new mail arrives' },
                { key: 'mentions' as const, label: 'Mentions', desc: 'Alert when you are mentioned' },
                { key: 'digest' as const, label: 'Daily digest', desc: 'Daily summary email' },
              ].map(item => (
                <div key={item.key} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-black">{item.label}</p>
                    <p className="text-xs text-black/40">{item.desc}</p>
                  </div>
                  <button
                    onClick={() => setNotifications(n => ({ ...n, [item.key]: !n[item.key] }))}
                    className={`w-10 h-6 rounded-full transition-colors relative ${notifications[item.key] ? 'bg-black' : 'bg-black/20'}`}
                  >
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${notifications[item.key] ? 'translate-x-5' : 'translate-x-1'}`} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Server */}
        {activeTab === 'server' && (
          <div className="border border-black/10 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-black mb-2">Server Configuration</h2>
            <p className="text-xs text-black/40 mb-4">Manage IMAP/SMTP settings per account in the Accounts page.</p>
            <div className="p-4 bg-black/[0.02] rounded-lg">
              <p className="text-xs font-mono text-black/60">Supabase project: mufffhziogmthccbpwww</p>
              <p className="text-xs font-mono text-black/40 mt-1">Edge functions: send-email, sync-emails</p>
            </div>
          </div>
        )}

        {/* Security */}
        {activeTab === 'security' && (
          <div className="space-y-4">
            <div className="border border-black/10 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-black mb-4">Account Security</h2>
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
