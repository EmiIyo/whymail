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
    // Timestamp query-buster: even if a CDN/proxy in front of us ignores
    // Cache-Control headers, the URL is different every call so the CDN can't
    // return a cached response. Browser `cache: 'no-store'` handles the local
    // HTTP cache; this handles the intermediary cache.
    const url = `/version.json?_=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return;
    const data = (await res.json().catch(() => null)) as { version?: string } | null;
    const latest = data?.version;
    if (!latest || latest === CURRENT_VERSION) return;

    if (sessionStorage.getItem(RELOAD_FLAG) === latest) return;
    sessionStorage.setItem(RELOAD_FLAG, latest);

    // Nudge the service worker to re-check too, then hard-reload with a
    // cache-busting query param. Plain location.reload() can still serve
    // an index.html cached by an upstream proxy; forcing a distinct URL
    // (?v=...) sidesteps that class of intermediaries.
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.update();
    } catch {
      /* ignore */
    }
    const bust = `_v=${encodeURIComponent(latest)}`;
    const sep = window.location.search ? '&' : '?';
    // Strip any old _v= before appending the fresh one so repeated updates
    // don't chain "?_v=a&_v=b&_v=c" over time.
    const cleanSearch = window.location.search.replace(/(?:^\?|&)_v=[^&]*/g, '').replace(/^&/, '?');
    const target = window.location.pathname + (cleanSearch || '') + (cleanSearch ? '&' : sep) + bust + window.location.hash;
    window.location.replace(target);
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
