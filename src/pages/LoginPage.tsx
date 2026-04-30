import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, ArrowRight, Mail, Lock, User, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/hooks/useAuth';
import { authApi } from '@/api/index';
import { ROUTE_PATHS } from '@/lib/index';
import { fadeInUp } from '@/lib/motion';

type Mode = 'signin' | 'signup';

export default function LoginPage() {
  const navigate = useNavigate();
  const { signIn, signUp, user, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const [signInEmail, setSignInEmail] = useState('');
  const [signInPass, setSignInPass] = useState('');
  const [signUpName, setSignUpName] = useState('');
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpPass, setSignUpPass] = useState('');
  const [signUpConfirm, setSignUpConfirm] = useState('');
  const [resetSent, setResetSent] = useState(false);

  // Already-signed-in users hitting /login go straight to inbox.
  useEffect(() => {
    if (!authLoading && user) navigate(ROUTE_PATHS.INBOX, { replace: true });
  }, [user, authLoading, navigate]);

  const handleForgotPassword = async () => {
    setError('');
    setInfo('');
    setResetSent(false);
    const target = signInEmail.trim();
    if (!target) {
      setError('Enter your email above first, then click "Forgot password?"');
      return;
    }
    setLoading(true);
    // The endpoint silently handles both cases:
    //   - Hosted mailbox -> token sent to its recovery email via ForwardEmail
    //   - Plain auth user -> Supabase native reset link sent to the user's own email
    // It always responds OK so we don't leak whether the address exists.
    const redirectTo = `${window.location.origin}${ROUTE_PATHS.RESET_PASSWORD}`;
    try {
      await authApi.requestPasswordReset(target, redirectTo);
      setResetSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request reset');
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error: err } = await signIn(signInEmail, signInPass);
    setLoading(false);
    if (err) { setError(err.message); return; }
    navigate(ROUTE_PATHS.INBOX);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (signUpPass !== signUpConfirm) { setError("Passwords don't match"); return; }
    setLoading(true);
    const { error: err } = await signUp(signUpEmail, signUpPass, signUpName);
    setLoading(false);
    if (err) { setError(err.message); return; }
    // Switch to sign-in tab and prefill the email. Show a clear status message
    // so the user understands what happened (depending on whether email
    // confirmation is enabled in Supabase, this may be "check your inbox" or
    // "you can sign in now").
    setMode('signin');
    setSignInEmail(signUpEmail);
    setSignInPass('');
    setInfo(`Account created for ${signUpEmail}. If your project requires email confirmation, check your inbox first; otherwise sign in below.`);
  };

  return (
    <div className="flex h-screen lg:h-auto lg:min-h-screen bg-background overflow-hidden lg:overflow-visible">
      {/* Left panel */}
      <div className="hidden lg:flex w-[46%] bg-foreground flex-col relative overflow-hidden shrink-0">
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        <div className="relative z-10 flex flex-col h-full px-12 py-10">
          <div className="flex items-center gap-3">
            <img src="/icon.png" alt="icon" className="w-9 h-9 object-contain brightness-0 invert" />
            <img src="/logo.png" alt="WhyMail" className="h-7 object-contain brightness-0 invert" />
          </div>
          <div className="flex-1 flex flex-col justify-center">
            <h2 className="text-4xl font-bold text-white leading-tight mb-4">Your email.<br />Your domain.<br />Your rules.</h2>
            <p className="text-white/50 text-base leading-relaxed">Self-hosted email for your own domains.</p>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 bg-background grid place-items-center h-screen lg:h-auto lg:min-h-screen">
        <div className="w-full max-w-[380px] px-6 py-8">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <img src="/icon.png" alt="icon" className="w-8 h-8 object-contain" />
            <img src="/logo.png" alt="WhyMail" className="h-6 object-contain" />
          </div>

          {/* Tab switcher */}
          <div className="flex bg-muted rounded-lg p-1 mb-8">
            {(['signin', 'signup'] as Mode[]).map(m => (
              <button key={m} onClick={() => { setMode(m); setError(''); setInfo(''); setResetSent(false); setLoading(false); }}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all duration-200 ${mode === m ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                {m === 'signin' ? 'Sign in' : 'Sign up'}
              </button>
            ))}
          </div>

          {/* Error */}
          {error && (
            <motion.div variants={fadeInUp} initial="hidden" animate="visible"
              className="flex items-center gap-2 text-destructive text-sm bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2 mb-4">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}

          {info && !error && (
            <motion.div variants={fadeInUp} initial="hidden" animate="visible"
              className="flex items-start gap-2 text-foreground text-sm bg-foreground/5 border border-foreground/15 rounded-lg px-3 py-2 mb-4">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              <span className="leading-snug">{info}</span>
            </motion.div>
          )}

          {resetSent && (
            <motion.div variants={fadeInUp} initial="hidden" animate="visible"
              className="flex items-start gap-2 text-emerald-800 text-sm bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-4">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-snug">If an account exists for that address, a password reset link has been sent. Check your inbox (or your recovery email if it's a hosted mailbox).</span>
            </motion.div>
          )}

          {/* Sign In */}
          {mode === 'signin' && (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Email address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input type="email" value={signInEmail} onChange={e => setSignInEmail(e.target.value)}
                    className="pl-9 font-mono text-sm" placeholder="you@yourdomain.com" required />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label className="text-xs text-muted-foreground">Password</Label>
                  <button type="button" onClick={handleForgotPassword} disabled={loading} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Forgot password?</button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input type={showPass ? 'text' : 'password'} value={signInPass} onChange={e => setSignInPass(e.target.value)} className="pl-9 pr-10" required />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" onClick={() => setShowPass(s => !s)}>
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full gap-2 mt-2" disabled={loading}>
                {loading ? <><span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />Signing in...</> : <><span>Sign in</span><ArrowRight className="w-4 h-4" /></>}
              </Button>
            </form>
          )}

          {/* Sign Up */}
          {mode === 'signup' && (
            <form onSubmit={handleSignUp} className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Full name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input type="text" value={signUpName} onChange={e => setSignUpName(e.target.value)} className="pl-9" placeholder="John Doe" required />
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Email address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input type="email" value={signUpEmail} onChange={e => setSignUpEmail(e.target.value)} className="pl-9 font-mono text-sm" placeholder="you@yourdomain.com" required />
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input type={showPass ? 'text' : 'password'} value={signUpPass} onChange={e => setSignUpPass(e.target.value)} className="pl-9 pr-10" placeholder="Min. 8 characters" required minLength={8} />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" onClick={() => setShowPass(s => !s)}>
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Confirm password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input type={showPass ? 'text' : 'password'} value={signUpConfirm} onChange={e => setSignUpConfirm(e.target.value)}
                    className={`pl-9 ${signUpConfirm && signUpConfirm !== signUpPass ? 'border-destructive' : ''}`} placeholder="Re-enter password" required />
                </div>
                {signUpConfirm && signUpConfirm !== signUpPass && <p className="text-xs text-destructive mt-1">Passwords don't match</p>}
              </div>
              <Button type="submit" className="w-full gap-2 mt-2" disabled={loading || (!!signUpConfirm && signUpConfirm !== signUpPass)}>
                {loading ? <><span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />Creating account...</> : <><span>Create account</span><ArrowRight className="w-4 h-4" /></>}
              </Button>
              <Separator />
              <p className="text-xs text-center text-muted-foreground">
                By signing up you agree to our{' '}
                <Link to={ROUTE_PATHS.TERMS} className="underline hover:text-foreground">Terms</Link>{' '}
                and{' '}
                <Link to={ROUTE_PATHS.PRIVACY} className="underline hover:text-foreground">Privacy Policy</Link>.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
