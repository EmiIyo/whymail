import { PenSquare } from 'lucide-react';
import { useEmailStore } from '@/hooks/useEmailStore';

// Floating compose button shown only on mobile (sits above the bottom tab bar).
export function MobileFAB() {
  const { openCompose } = useEmailStore();
  return (
    <button
      onClick={() => openCompose()}
      aria-label="Compose new message"
      className="lg:hidden fixed right-4 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 flex items-center justify-center active:scale-95 transition-transform"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 72px)' }}
    >
      <PenSquare className="w-5 h-5" strokeWidth={2.2} />
    </button>
  );
}
