import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { accountsApi } from '@/api/index';
import { useAuth } from '@/hooks/useAuth';
import { ROUTE_PATHS } from '@/lib/index';

const MIN_LEN = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ChangePasswordPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const forced = (location.state as { forced?: boolean } | null)?.forced ?? false;

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Fetch the user's mailboxes that are missing a recovery email so we can
  // require them to set one during the forced first-login flow.
  const { data: missingRecovery = [] } = useQuery({
    queryKey: ['missing-recovery', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const all = await accountsApi.list();
      return all
        .filter((a) => a.ownerUserId === user?.id && !a.recoveryEmail)
        .map((a) => ({ id: a.id, email: a.email }));
    },
  });

  const needsRecovery = forced && missingRecovery.length > 0;

  const submitMutation = useMutation({
    mutationFn: async () => {
      setError(null);
      if (password.length < MIN_LEN) throw new Error(`Password must be at least ${MIN_LEN} characters`);
      if (password !== confirm) throw new Error('Passwords do not match');
      if (needsRecovery) {
        const candidate = recoveryEmail.trim().toLowerCase();
        if (!candidate) throw new Error('Recovery email is required so you can recover this account if you ever forget your password');
        if (!EMAIL_RE.test(candidate)) throw new Error('Invalid recovery email format');
      }

      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) throw new Error(updateErr.message);

      // Best-effort: persist the recovery email on every mailbox the user
      // owns that didn't already have one. Failures here are non-fatal —
      // the user can edit it later from Settings.
      if (needsRecovery) {
        const candidate = recoveryEmail.trim().toLowerCase();
        for (const mb of missingRecovery) {
          try {
            await accountsApi.update(mb.id, { recoveryEmail: candidate });
          } catch (mbErr) {
            console.warn('Failed to set recovery email for', mb.email, mbErr);
          }
        }
      }

      const { error: confirmErr } = await supabase.functions.invoke('confirm-password-change');
      if (confirmErr) console.warn('confirm-password-change failed:', confirmErr);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['must-change-password'] });
      await qc.refetchQueries({ queryKey: ['must-change-password'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['missing-recovery'] });
      navigate(ROUTE_PATHS.INBOX, { replace: true });
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-black/5 flex items-center justify-center mx-auto mb-3">
            <KeyRound size={20} className="text-black" />
          </div>
          <h1 className="text-xl font-semibold text-black">
            {forced ? 'Set a new password' : 'Change password'}
          </h1>
          <p className="text-xs text-black/50 mt-1">
            {forced
              ? 'Your administrator created this mailbox with an initial password. Choose a new one to continue.'
              : 'Enter a new password for your account.'}
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-medium text-black/50 uppercase tracking-wide mb-1 block">New password</label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={`Min ${MIN_LEN} characters`}
                className="w-full text-sm border border-black/20 rounded-lg px-3 py-2 pr-9 outline-none focus:border-black bg-white"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPwd((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-black/40 hover:text-black"
              >
                {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-medium text-black/50 uppercase tracking-wide mb-1 block">Confirm</label>
            <input
              type={showPwd ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat the new password"
              className="w-full text-sm border border-black/20 rounded-lg px-3 py-2 outline-none focus:border-black bg-white"
            />
          </div>

          {needsRecovery && (
            <div className="border border-amber-200 bg-amber-50 rounded-lg p-3 space-y-2">
              <div className="flex items-start gap-2">
                <ShieldCheck size={14} className="text-amber-700 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-800 leading-relaxed">
                  Set a personal email so you can reset your password if you ever forget it.
                  Without one, only your administrator can recover your account.
                </p>
              </div>
              <div>
                <label className="text-[10px] font-medium text-black/50 uppercase tracking-wide mb-1 block">Personal email (recovery)</label>
                <input
                  type="email"
                  value={recoveryEmail}
                  onChange={(e) => setRecoveryEmail(e.target.value)}
                  placeholder="your-personal@gmail.com"
                  className="w-full text-sm border border-black/20 rounded-lg px-3 py-2 outline-none focus:border-black bg-white"
                />
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            onClick={() => submitMutation.mutate()}
            disabled={submitMutation.isPending}
            className="w-full bg-black text-white text-sm py-2.5 rounded-lg hover:bg-black/80 disabled:opacity-50 transition-colors"
          >
            {submitMutation.isPending ? 'Updating…' : 'Update password'}
          </button>
        </div>
      </div>
    </div>
  );
}
