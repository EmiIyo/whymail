import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users, Globe, Mail, Activity, Search, ShieldCheck, KeyRound, X, ChevronDown,
} from 'lucide-react';
import { adminApi, domainsApi, domainAdminsApi } from '@/api/index';
import { useToast } from '@/hooks/use-toast';
import { ROUTE_PATHS, formatRelative } from '@/lib/index';
import type { AdminUserRow } from '@/lib/index';

type RoleFilter = 'all' | 'super' | 'coadmin' | 'enduser' | 'noaccess';

export default function AdminDashboardPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [grantTarget, setGrantTarget] = useState<AdminUserRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-overview'],
    queryFn: () => adminApi.overview(),
    staleTime: 30 * 1000,
  });

  const stats = data?.stats;
  const users = data?.users ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter((u) => {
        if (q && !u.email.toLowerCase().includes(q)) return false;
        switch (roleFilter) {
          case 'super':   return u.isSuperAdmin;
          case 'coadmin': return !u.isSuperAdmin && u.coAdminDomainIds.length > 0;
          case 'enduser': return !u.isSuperAdmin && u.coAdminDomainIds.length === 0 && u.ownsMailbox;
          case 'noaccess':return !u.isSuperAdmin && u.coAdminDomainIds.length === 0 && !u.ownsMailbox;
          default: return true;
        }
      })
      // Super admins always render first; secondary sort by email so the order
      // is stable across reloads.
      .sort((a, b) => {
        if (a.isSuperAdmin !== b.isSuperAdmin) return a.isSuperAdmin ? -1 : 1;
        return a.email.localeCompare(b.email);
      });
  }, [users, search, roleFilter]);

  const resetMutation = useMutation({
    mutationFn: (u: AdminUserRow) => adminApi.resetUserPassword(
      u.id,
      `${window.location.origin}${ROUTE_PATHS.RESET_PASSWORD}`,
    ),
    onSuccess: (res) => {
      toast({
        title: 'Reset link sent',
        description: `Sent to ${res.sentTo} (${res.mode === 'mailbox' ? 'recovery email' : 'auth email'}).`,
      });
    },
    onError: (err: Error) => {
      toast({ title: 'Reset failed', description: err.message, variant: 'destructive' });
    },
  });


  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="sticky top-0 z-10 px-6 py-4 border-b border-black/10 bg-white">
        <h1 className="text-base font-semibold text-black">Admin Dashboard</h1>
        <p className="text-xs text-black/40 mt-0.5">Platform-wide stats and user management</p>
      </div>

      <div className="px-6 py-5 space-y-6 pb-24 lg:pb-6 max-w-5xl mx-auto">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard icon={Users}    label="Users"        value={stats?.totalUsers}    loading={isLoading} />
          <StatCard icon={Globe}    label="Domains"      value={stats?.totalDomains}  loading={isLoading} />
          <StatCard icon={Mail}     label="Mailboxes"    value={stats?.totalMailboxes} loading={isLoading} />
          <StatCard icon={Activity} label="Active 7d"    value={stats?.activeLast7Days} loading={isLoading} />
        </div>

        {/* User list */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-black">Users</h2>
            <span className="text-xs text-black/40">{filtered.length} of {users.length}</span>
          </div>

          {/* Search + role filter */}
          <div className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-black/30" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by email…"
                className="w-full pl-8 pr-3 py-2 text-sm border border-black/15 rounded-lg outline-none focus:border-black bg-white"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
              className="text-sm border border-black/15 rounded-lg px-3 py-2 bg-white outline-none focus:border-black"
            >
              <option value="all">All roles</option>
              <option value="super">Super admin</option>
              <option value="coadmin">Co-admin</option>
              <option value="enduser">End-user (mailbox)</option>
              <option value="noaccess">No access</option>
            </select>
          </div>

          {/* Table */}
          <div className="border border-black/10 rounded-xl divide-y divide-black/5 overflow-hidden">
            {isLoading && (
              <div className="px-4 py-8 text-center text-xs text-black/40">Loading…</div>
            )}
            {!isLoading && filtered.length === 0 && (
              <div className="px-4 py-8 text-center text-xs text-black/40">No users match your filter.</div>
            )}
            {filtered.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                onGrant={() => setGrantTarget(u)}
                onResetPassword={() => {
                  if (window.confirm(`Send password reset to ${u.email}?`)) resetMutation.mutate(u);
                }}
                isResetting={resetMutation.isPending && resetMutation.variables?.id === u.id}
              />
            ))}
          </div>
        </section>
      </div>

      {grantTarget && (
        <GrantDomainAdminDialog
          user={grantTarget}
          onClose={() => setGrantTarget(null)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['admin-overview'] });
            qc.invalidateQueries({ queryKey: ['domain-admins'] });
            qc.invalidateQueries({ queryKey: ['domains'] });
            setGrantTarget(null);
            toast({ title: 'Domain admin granted' });
          }}
        />
      )}
    </div>
  );
}

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | undefined;
  loading: boolean;
}

function StatCard({ icon: Icon, label, value, loading }: StatCardProps) {
  return (
    <div className="border border-black/10 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5 text-black/40" />
        <span className="text-[11px] uppercase tracking-wide text-black/40 font-medium">{label}</span>
      </div>
      <div className="text-2xl font-semibold text-black tabular-nums">
        {loading ? '—' : (value ?? 0).toLocaleString()}
      </div>
    </div>
  );
}

interface UserRowProps {
  user: AdminUserRow;
  onGrant: () => void;
  onResetPassword: () => void;
  isResetting: boolean;
}

function UserRow({ user: u, onGrant, onResetPassword, isResetting }: UserRowProps) {
  const role = u.isSuperAdmin
    ? 'Super admin'
    : u.coAdminDomainIds.length > 0
      ? `Co-admin · ${u.coAdminDomainNames.join(', ')}`
      : u.ownsMailbox
        ? 'End-user (mailbox)'
        : 'No access';
  const roleStyle = u.isSuperAdmin
    ? 'bg-black text-white'
    : u.coAdminDomainIds.length > 0
      ? 'bg-emerald-100 text-emerald-700'
      : u.ownsMailbox
        ? 'bg-black/5 text-black/60'
        : 'bg-amber-50 text-amber-700';

  return (
    <div className="px-4 py-3 flex items-center gap-3">
      <div className="w-8 h-8 rounded-full bg-black/5 flex items-center justify-center shrink-0 text-xs font-semibold text-black/60">
        {(u.email[0] ?? '?').toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-black truncate">{u.email}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${roleStyle}`}>{role}</span>
          {u.domainCount > 0 && (
            <span className="text-[10px] font-medium text-black/60 bg-black/5 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
              <Globe size={9} />
              {u.domainCount} domain{u.domainCount === 1 ? '' : 's'}
            </span>
          )}
          {u.lastSignInAt ? (
            <span className="text-[10px] text-black/40">Last seen {formatRelative(u.lastSignInAt)}</span>
          ) : (
            <span className="text-[10px] text-black/40">Never signed in</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {!u.isSuperAdmin && (
          <button
            onClick={onGrant}
            className="p-1.5 text-black/40 hover:text-emerald-600 rounded transition-colors"
            title="Grant domain admin access"
          >
            <ShieldCheck size={14} />
          </button>
        )}
        <button
          onClick={onResetPassword}
          disabled={isResetting}
          className="p-1.5 text-black/40 hover:text-black rounded transition-colors disabled:opacity-50"
          title="Send password reset link"
        >
          <KeyRound size={14} />
        </button>
      </div>
    </div>
  );
}

interface GrantDialogProps {
  user: AdminUserRow;
  onClose: () => void;
  onSuccess: () => void;
}

function GrantDomainAdminDialog({ user, onClose, onSuccess }: GrantDialogProps) {
  const [domainId, setDomainId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: domains = [] } = useQuery({
    queryKey: ['domains'],
    queryFn: () => domainsApi.list(),
  });

  // Domains the user is NOT already an admin of.
  const grantable = domains.filter((d) => !user.coAdminDomainIds.includes(d.id));

  const grantMutation = useMutation({
    mutationFn: () => {
      setError(null);
      if (!domainId) throw new Error('Pick a domain');
      return domainAdminsApi.add(domainId, user.email);
    },
    onSuccess: () => onSuccess(),
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-black">Grant domain admin to {user.email}</h2>
          <button onClick={onClose} className="text-black/30 hover:text-black"><X size={16} /></button>
        </div>
        <p className="text-xs text-black/50">
          The user will be able to manage mailboxes for the selected domain. They will not be able to
          add or delete domains.
        </p>
        <div>
          <label className="text-[10px] font-medium text-black/50 uppercase tracking-wide mb-1 block">Domain</label>
          <div className="relative">
            <select
              value={domainId}
              onChange={(e) => setDomainId(e.target.value)}
              className="w-full text-sm border border-black/20 rounded-lg pl-3 pr-9 py-2 outline-none focus:border-black bg-white appearance-none"
            >
              <option value="">— pick a domain —</option>
              {grantable.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-black/40 pointer-events-none" />
          </div>
          {grantable.length === 0 && (
            <p className="text-[11px] text-black/40 mt-1">User is already an admin of every domain.</p>
          )}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="text-xs text-black/50 px-3 py-2 hover:text-black">Cancel</button>
          <button
            onClick={() => grantMutation.mutate()}
            disabled={grantMutation.isPending || !domainId}
            className="bg-black text-white text-xs px-4 py-2 rounded-lg hover:bg-black/80 disabled:opacity-50 transition-colors"
          >
            {grantMutation.isPending ? 'Granting…' : 'Grant access'}
          </button>
        </div>
      </div>
    </div>
  );
}
