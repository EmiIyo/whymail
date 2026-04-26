import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, ArrowRight, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authApi } from '@/api/index';
import { ROUTE_PATHS } from '@/lib/index';
import { fadeInUp } from '@/lib/motion';

// Token-based reset flow. The recovery email link contains ?token=...; we
// pass it together with the chosen new password to confirm-password-reset
// which validates the token, sets the new password, and burns the token.
export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [token, setToken] = useState<string>('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    // HashRouter strips the query string in some setups; check both URL and
    // useSearchParams to be safe.
    const fromQuery = searchParams.get('token');
    if (fromQuery) {
      setToken(fromQuery);
      return;
    }
    const hashSearch = window.location.hash.split('?')[1];
    if (hashSearch) {
      const params = new URLSearchParams(hashSearch);
      const t = params.get('token');
      if (t) setToken(t);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!token) { setError('Reset token is missing from the link.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setLoading(true);
    try {
      await authApi.confirmPasswordReset(token, password);
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
          <img src="/logo.png" alt="WhyMail" className="h-6 object-contain" />
        </div>

        <h1 className="text-xl font-semibold mb-2">Reset your password</h1>
        <p className="text-sm text-muted-foreground mb-6">Enter a new password for your mailbox.</p>

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

        {!token && !done && (
          <p className="text-sm text-muted-foreground">
            This link is invalid. Request a new reset link from the sign-in page.
          </p>
        )}

        {token && !done && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">New password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} className="pl-9 pr-10" required minLength={8} placeholder="Min. 8 characters" />
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
      </div>
    </div>
  );
}
