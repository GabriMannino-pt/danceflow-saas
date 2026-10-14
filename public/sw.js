// Tropical Style Caribbean School Service Worker - Self-Destroy & Purge
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) => {
        clients.forEach((client) => {
          if ('navigate' in client) {
            client.navigate(client.url);
          }
        });
      })
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Always bypass cache for Firestore, Firebase, APIs, and HTML documents/navigation
  if (
    event.request.mode === 'navigate' ||
    event.request.headers.get('accept')?.includes('text/html') ||
    url.pathname === '/' ||
    url.pathname === '/index.html' ||
    url.origin.includes('firestore.googleapis.com') ||
    url.origin.includes('firebase')
  ) {
    event.respondWith(
      fetch(event.request).catch((err) => {
        return caches.match(event.request) || caches.match('/index.html');
      })
    );
    return;
  }

  // Network-first with fallback to cache for other assets
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});
