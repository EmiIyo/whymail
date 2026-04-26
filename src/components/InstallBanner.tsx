import { useEffect, useState } from 'react';
import { Download, Share, Plus, X } from 'lucide-react';
import { useIsDesktop } from '@/hooks/useMediaQuery';

const DISMISSED_KEY = 'whymail.install-banner.dismissed-at';
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari uses navigator.standalone
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);
}

function recentlyDismissed(): boolean {
  try {
    const t = Number(localStorage.getItem(DISMISSED_KEY) ?? '0');
    return t > 0 && Date.now() - t < DISMISS_TTL_MS;
  } catch { return false; }
}

export function InstallBanner() {
  const isDesktop = useIsDesktop();
  const [show, setShow] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    if (isDesktop) return;
    if (isStandalone()) return;
    if (recentlyDismissed()) return;

    // Android Chrome / Edge: native install prompt
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    // iOS Safari: no prompt API; show a manual instruction banner.
    if (isIOS()) {
      // Slight delay so it doesn't appear before the page settles.
      const t = window.setTimeout(() => setShow(true), 1200);
      return () => {
        clearTimeout(t);
        window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      };
    }

    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, [isDesktop]);

  const dismiss = () => {
    try { localStorage.setItem(DISMISSED_KEY, String(Date.now())); } catch { /* ignore */ }
    setShow(false);
    setShowIosHint(false);
  };

  const triggerInstall = async () => {
    if (installEvent) {
      await installEvent.prompt();
      const result = await installEvent.userChoice;
      if (result.outcome === 'accepted') {
        setShow(false);
        setInstallEvent(null);
      }
      return;
    }
    // iOS path: show inline instructions sheet.
    setShowIosHint(true);
  };

  if (isDesktop || !show) return null;

  return (
    <>
      <div
        className="lg:hidden fixed left-3 right-3 z-30 bg-foreground text-background rounded-2xl shadow-xl px-4 py-3 flex items-center gap-3"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 72px)' }}
      >
        <div className="w-9 h-9 rounded-lg bg-background/10 flex items-center justify-center shrink-0">
          <Download className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold leading-tight">Install WhyMail</p>
          <p className="text-[11px] opacity-70 leading-tight mt-0.5">Hide the browser bars and run like a native app.</p>
        </div>
        <button
          onClick={triggerInstall}
          className="text-[12px] font-medium bg-background text-foreground rounded-full px-3 py-1.5 active:scale-95 transition-transform"
        >
          Install
        </button>
        <button onClick={dismiss} aria-label="Dismiss" className="opacity-60 active:opacity-100">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* iOS instructions sheet */}
      {showIosHint && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/50 flex items-end" onClick={dismiss}>
          <div
            className="w-full bg-card text-card-foreground rounded-t-3xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
          >
            <div className="w-10 h-1 rounded-full bg-foreground/20 mx-auto -mt-1 mb-1" />
            <h3 className="text-base font-semibold">Add WhyMail to your Home Screen</h3>
            <p className="text-sm text-muted-foreground">
              iOS doesn’t let websites install themselves. Just two taps:
            </p>
            <ol className="space-y-3">
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-foreground/10 flex items-center justify-center text-xs font-semibold shrink-0 mt-0.5">1</span>
                <div className="flex items-center gap-2 text-sm">
                  Tap the
                  <span className="inline-flex items-center px-2 py-1 rounded-md bg-foreground/5 gap-1">
                    <Share className="w-3.5 h-3.5" />
                    Share
                  </span>
                  button at the bottom of Safari.
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-foreground/10 flex items-center justify-center text-xs font-semibold shrink-0 mt-0.5">2</span>
                <div className="flex items-center gap-2 text-sm">
                  Tap
                  <span className="inline-flex items-center px-2 py-1 rounded-md bg-foreground/5 gap-1">
                    <Plus className="w-3.5 h-3.5" />
                    Add to Home Screen
                  </span>
                  then <strong>Add</strong>.
                </div>
              </li>
            </ol>
            <button
              onClick={dismiss}
              className="w-full text-sm bg-foreground text-background rounded-xl py-2.5 mt-2 active:scale-[0.98] transition-transform"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
