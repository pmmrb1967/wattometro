// SPDX-License-Identifier: AGPL-3.0-or-later
// Web Push in the PWA's service worker (imported by the one vite-plugin-pwa
// generates: vite.config.ts, workbox.importScripts). The Worker sends
// {title, body, tag, url}, encrypted for this browser (server/src/alerts.ts).
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Wattómetro', {
      body: data.body || '',
      tag: data.tag || 'wattometro',
      icon: '/pwa-192x192.png',
      badge: '/pwa-64x64.png',
      data: { url: data.url || '/' },
    }),
  );
});

// Opens the alert's page, in the app's window when it is open.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
