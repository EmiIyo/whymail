/* WhyMail service worker — Web Push notifications.
 *
 * Kept intentionally tiny: it only handles incoming push messages and clicks.
 * It does NOT cache app assets (no offline support) to avoid serving stale
 * builds. The push payload is JSON produced by the receive-email edge function:
 *   { title, body, tag, url }
 */

self.addEventListener('install', () => {
  // Activate this worker immediately rather than waiting for old tabs to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_e) {
    data = { title: 'New email', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'New email';
  const options = {
    body: data.body || '',
    icon: '/icon.png',
    badge: '/icon.png',
    // Collapse repeated notifications for the same mailbox into one.
    tag: data.tag || 'whymail-new-mail',
    renotify: true,
    data: { url: data.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      // Focus an existing WhyMail tab if one is open, else open a new one.
      for (const client of allClients) {
        if ('focus' in client) {
          if ('navigate' in client) {
            try { await client.navigate(targetUrl); } catch (_e) { /* cross-origin guard */ }
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })(),
  );
});

