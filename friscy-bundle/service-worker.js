const CACHE_NAME = 'friscy-cache-v9';
const CACHE_ASSETS = [
  './',
  './index.html',
  './friscy.js',
  './friscy.wasm',
  './rootfs.tar',
  './manifest.json',
  './network_bridge.js',
  'https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css',
  'https://cdn.jsdelivr.net/npm/xterm@5.3.0/+esm',
  'https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/+esm',
];

// Small files that change often during development — always fetch fresh
const NETWORK_FIRST = new Set([
  '/friscy.js',
  '/friscy.wasm',
  '/index.html',
  '/manifest.json',
  '/network_bridge.js',
  '/',
]);

// Install: cache assets, activate immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        CACHE_ASSETS.map(url =>
          cache.add(url).catch(e => console.warn('[SW] Failed to cache:', url, e.message))
        )
      );
    })
  );
});

// Activate: purge old caches, claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.map(n => n !== CACHE_NAME ? caches.delete(n) : undefined))
    ).then(() => self.clients.claim())
  );
});

// Fetch: network-first for small dev files, cache-first for large assets (rootfs.tar)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only intercept same-origin or CDN assets
  const isSameOrigin = url.origin === self.location.origin;
  const useNetworkFirst = isSameOrigin && NETWORK_FIRST.has(url.pathname);

  if (useNetworkFirst) {
    // Network-first: always get latest, fall back to cache
    event.respondWith(
      fetch(event.request).then((resp) => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return resp;
      }).catch(() =>
        caches.match(event.request).then(r =>
          r || new Response('Offline', { status: 503 })
        )
      )
    );
  } else {
    // Cache-first: serve instantly from cache (rootfs.tar, CDN libs, etc.)
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((resp) => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return resp;
        });
      }).catch(() =>
        new Response('Offline', { status: 503 })
      )
    );
  }
});
