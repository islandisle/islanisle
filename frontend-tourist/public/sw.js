// Offline support — tourists lose signal at sea/on remote islands, so this
// is the primary target for offline resilience (see frontend-business's
// sw.js for the lighter mirror). Two things, deliberately not more:
//   1. Cache-then-network for anything already fetched, so a page you've
//      already opened (the app shell, a listing you viewed, "My bookings")
//      still renders with no signal, instead of a blank failed-fetch page.
//   2. Booking/order submission queuing is NOT done here — that needs
//      request bodies preserved and retried against the exact right
//      endpoint, which is simpler and more testable living in
//      src/offlineQueue.js and being called directly from api/client.js
//      than routed through a service worker's fetch handler.

const CACHE_NAME = 'atollisle-v1';
const CORE_ASSETS = ['/', '/manifest.json', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only ever cache safe, idempotent reads. Mutations (POST/PATCH/DELETE —
  // bookings, orders, messages, everything that changes something) always
  // go straight to the network and are never served from cache; if one
  // fails offline, the app's own offlineQueue.js handles queuing it, not
  // this service worker.
  if (request.method !== 'GET') return;

  // Cross-origin (the API server on a different port/host in dev) still
  // gets the same network-first-then-cache treatment so "My bookings" etc.
  // can render from cache offline — just cached under its own key.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') {
          const shell = await caches.match('/');
          if (shell) return shell;
        }
        throw new Error('offline and not cached');
      })
  );
});
