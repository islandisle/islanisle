// Basic offline resilience — the lighter mirror of frontend-tourist's
// sw.js. Same cache-then-network strategy for GET requests, so "Incoming
// bookings/orders" and your listings still render offline from whatever
// was last loaded. "Mark fulfilled" / order status changes queue for
// retry the same way a tourist's booking does — see src/offlineQueue.js
// and its use in api/client.js — this service worker only handles the
// GET-caching half.

const CACHE_NAME = 'atollisle-business-v1';
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
  if (request.method !== 'GET') return;

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
