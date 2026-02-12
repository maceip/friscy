const CACHE_NAME = 'friscy-cache-v3'; // Tagged cache for versioning
const CACHE_ASSETS = [
  './', // Cache index.html
  './index.html',
  './friscy.js',
  './friscy.wasm',
  './rootfs.tar',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css',
  'https://cdn.jsdelivr.net/npm/xterm@5.3.0/+esm',
  'https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/+esm',
];

// Install event: cache assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching all assets');
        return cache.addAll(CACHE_ASSETS);
      })
      .catch(error => {
        console.error('[Service Worker] Caching failed:', error);
      })
  );
});

// Activate event: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch event: serve from cache if available, otherwise fetch from network
self.addEventListener('fetch', (event) => {
  // Always go to network for friscy.js and friscy.wasm if they are not yet in cache
  // This is because friscy.js might be re-generated often during development
  // We want to serve friscy.js and friscy.wasm from cache only if they are already present
  // For other assets, use a cache-first strategy.
  const url = new URL(event.request.url);
  const isLocalAsset = url.origin === self.location.origin && ( // Use self.location.origin in SW
    url.pathname.endsWith('/friscy.js') ||
    url.pathname.endsWith('/friscy.wasm') ||
    url.pathname.endsWith('/rootfs.tar') ||
    url.pathname.endsWith('/manifest.json')
  );

  if (isLocalAsset) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        // Cache-first, but update cache from network in background
        const fetchAndCache = fetch(event.request).then((networkResponse) => {
          if (networkResponse.ok) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse.clone());
            });
          }
          return networkResponse;
        }).catch(() => {
            // Network failed, return cached response if available
            return cachedResponse || new Response('Network request failed and no cache available', { status: 408, headers: { 'Content-Type': 'text/plain' } });
        });

        return cachedResponse || fetchAndCache;
      })
    );
  } else {
    // For all other requests (like CDN assets), use a cache-first strategy
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        return cachedResponse || fetch(event.request).then((networkResponse) => {
          // Cache successful responses
          if (networkResponse.ok) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse.clone());
            });
          }
          return networkResponse;
        });
      })
    );
  }
});
