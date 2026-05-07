import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, ArrowRight, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authApi } from '@/api/index';
import { supabase } from '@/lib/supabase';
import { ROUTE_PATHS } from '@/lib/index';
import { fadeInUp } from '@/lib/motion';

// Two flows land on this page:
//   1. Hosted-mailbox reset: link contains ?token=xxx and is consumed via our
//      confirm-password-reset edge function.
//   2. Plain auth-user reset: Supabase's resetPasswordForEmail sends a link
//      with a recovery code; supabase-js exchanges it automatically and fires
//      a PASSWORD_RECOVERY event. We then call supabase.auth.updateUser().
type Mode = 'token' | 'recovery' | 'idle';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<Mode>('idle');
  const [token, setToken] = useState<string>('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  // Determine the flow on mount.
  useEffect(() => {
    const fromQuery = searchParams.get('token');
    if (fromQuery) {
      setToken(fromQuery);
      setMode('token');
      return;
    }
    // Supabase's recovery link drops a code in the URL; the SDK
    // exchanges it for a session and fires PASSWORD_RECOVERY. If a session is
    // already present (or appears momentarily) treat it as native flow.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setMode('recovery');
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setMode('recovery');
    });
    return () => subscription.unsubscribe();
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setLoading(true);
    try {
      if (mode === 'token') {
        await authApi.confirmPasswordReset(token, password);
      } else if (mode === 'recovery') {
        const { error: err } = await supabase.auth.updateUser({ password });
        if (err) throw new Error(err.message);
        // After updating, sign out so the user enters the new credentials cleanly.
        await supabase.auth.signOut().catch(() => {});
      } else {
        throw new Error('No reset link detected. Request a new one from the sign-in page.');
      }
      setDone(true);
      setTimeout(() => navigate(ROUTE_PATHS.LOGIN), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background px-6">
      <div className="w-full max-w-[380px]">
        <div className="flex items-center gap-2.5 mb-8">
          <img src="/icon.png" alt="icon" className="w-8 h-8 object-contain" />
          <img src="/logo.png" alt="WhyMail" className="h-8 object-contain" />
        </div>

        <h1 className="text-xl font-semibold mb-2">Reset your password</h1>
        <p className="text-sm text-muted-foreground mb-6">Enter a new password for your account.</p>

        {done && (
          <motion.div variants={fadeInUp} initial="hidden" animate="visible"
            className="flex items-center gap-2 text-emerald-700 text-sm bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-4">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Password updated. Redirecting to sign in…</span>
          </motion.div>
        )}

        {error && (
          <motion.div variants={fadeInUp} initial="hidden" animate="visible"
            className="flex items-center gap-2 text-destructive text-sm bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2 mb-4">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}

        {mode === 'idle' && !done && (
          <p className="text-sm text-muted-foreground">
            This link is invalid or has expired. Request a new one from the sign-in page.
          </p>
        )}

        {(mode === 'token' || mode === 'recovery') && !done && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">New password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} className="pl-9 pr-10" required minLength={8} placeholder="Min. 8 characters" autoFocus />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" onClick={() => setShowPass(s => !s)}>
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Confirm new password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input type={showPass ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)} className="pl-9" required placeholder="Re-enter password" />
              </div>
            </div>
            <Button type="submit" className="w-full gap-2 mt-2" disabled={loading}>
              {loading
                ? <><span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />Updating…</>
                : <><span>Update password</span><ArrowRight className="w-4 h-4" /></>}
            </Button>
          </form>
        )}

        <button
          onClick={() => navigate(ROUTE_PATHS.LOGIN)}
          className="w-full text-xs text-muted-foreground hover:text-foreground mt-4 transition-colors"
        >
          Back to sign in
        </button>
      </div>
    </div>
  );
}
