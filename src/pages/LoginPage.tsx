import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, ArrowRight, Mail, Lock, User, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { ROUTE_PATHS } from '@/lib/index';
import { fadeInUp } from '@/lib/motion';

type Mode = 'signin' | 'signup';

export default function LoginPage() {
  const navigate = useNavigate();
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [signInEmail, setSignInEmail] = useState('');
  const [signInPass, setSignInPass] = useState('');
  const [signUpName, setSignUpName] = useState('');
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpPass, setSignUpPass] = useState('');
  const [signUpConfirm, setSignUpConfirm] = useState('');
  const [resetSent, setResetSent] = useState(false);

  const handleForgotPassword = async () => {
    setError('');
    setResetSent(false);
    const target = signInEmail.trim();
    if (!target) {
      setError('Enter your email above first, then click "Forgot password?"');
      return;
    }
    setLoading(true);
    const redirectTo = `${window.location.origin}${window.location.pathname}#${ROUTE_PATHS.RESET_PASSWORD}`;
    const { error: err } = await supabase.auth.resetPasswordForEmail(target, { redirectTo });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setResetSent(true);
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
    if (signUpPass !== signUpConfirm) { setError("Passwords don't match"); return; }
    setLoading(true);
    const { error: err } = await signUp(signUpEmail, signUpPass, signUpName);
    setLoading(false);
    if (err) { setError(err.message); return; }
    setError('');
    setMode('signin');
    setSignInEmail(signUpEmail);
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
            <p className="text-white/50 text-base leading-relaxed">A full-featured webmail client with real IMAP & SMTP, custom domains, folders, search, and attachments.</p>
          </div>
          <div className="space-y-3 pb-2">
            {['Custom domain email addresses', 'Real IMAP & SMTP connections', 'Compose with attachments', 'Search across all your mail'].map(f => (
              <div key={f} className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-white/40 shrink-0" />
                <span className="text-sm text-white/50">{f}</span>
              </div>
            ))}
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
              <button key={m} onClick={() => { setMode(m); setError(''); setLoading(false); }}
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

          {resetSent && (
            <motion.div variants={fadeInUp} initial="hidden" animate="visible"
              className="flex items-center gap-2 text-emerald-700 text-sm bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-4">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Password reset email sent. Check your inbox.</span>
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
                By signing up you agree to our <span className="underline cursor-pointer hover:text-foreground">Terms</span> and <span className="underline cursor-pointer hover:text-foreground">Privacy Policy</span>.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
