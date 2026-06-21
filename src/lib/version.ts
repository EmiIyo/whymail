// Auto-update: detect when a newer build has been deployed and reload so the
// user always runs the latest version when they open / return to the app.
//
// How it works: every build bakes `__APP_VERSION__` into the bundle and emits
// a matching `/version.json`. At runtime we fetch that file (bypassing cache)
// and, if its version differs from the one we're running, reload the page.

const CURRENT_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

// Guards against a reload loop if a stale index.html keeps serving the old
// bundle: we only auto-reload once per detected target version per session.
const RELOAD_FLAG = 'wm:reloaded-for-version';

let inFlight = false;

export async function checkForUpdate(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    const res = await fetch('/version.json', { cache: 'no-store' });
    if (!res.ok) return;
    const data = (await res.json().catch(() => null)) as { version?: string } | null;
    const latest = data?.version;
    if (!latest || latest === CURRENT_VERSION) return;

    if (sessionStorage.getItem(RELOAD_FLAG) === latest) return;
    sessionStorage.setItem(RELOAD_FLAG, latest);

    // Nudge the service worker to re-check too, then hard-reload.
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.update();
    } catch {
      /* ignore */
    }
    window.location.reload();
  } catch {
    // Offline or network error — try again on the next trigger.
  } finally {
    inFlight = false;
  }
}

let started = false;

/**
 * Begin watching for updates. Checks immediately, whenever the app is brought
 * back to the foreground (PWA reopened / tab refocused), and periodically while
 * left open. No-op in dev where /version.json isn't emitted.
 */
export function startUpdateWatcher(): void {
  if (started) return;
  started = true;

  void checkForUpdate();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkForUpdate();
  });
  window.addEventListener('focus', () => void checkForUpdate());

  // Backstop for sessions left open in the foreground for a long time.
  setInterval(() => void checkForUpdate(), 15 * 60 * 1000);
}
