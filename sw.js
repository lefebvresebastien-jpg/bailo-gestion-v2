// Bailo Gestion v2 — Service Worker v1
// Rôle : permettre l'installation PWA propre + recevoir les notifications
// push à l'avenir. Pas de cache de fichiers (tout passe par le réseau) pour
// éviter d'afficher une version périmée de l'app après une mise à jour.

const CACHE_NAME = 'bailo-gestion-v2-sw-v1';

self.addEventListener('install', function(event) {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(key) {
        return caches.delete(key);
      }));
    })
  );
  self.clients.claim();
});

// Pas d'intercepteur fetch — tout passe directement par le réseau,
// pour ne jamais servir une version périmée du HTML/JS de l'app.

// ── Notifications push (prêt pour activation future) ──
self.addEventListener('push', function(event) {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch (e) {
    payload = { title: 'Bailo Gestion', body: event.data.text() };
  }
  const title = payload.title || 'Bailo Gestion';
  const options = {
    body: payload.body || '',
    icon: payload.icon || 'https://bailo.pro/bailo_gestion_mascotte.png',
    badge: payload.badge || 'https://bailo.pro/icon-192.png',
    data: payload.url ? { url: payload.url } : {}
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || 'https://gestion.bailo.pro';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
