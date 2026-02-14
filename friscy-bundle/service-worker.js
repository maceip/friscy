const CACHE_NAME = 'friscy-cache-v14';
const CACHE_ASSETS = [
  './',
  './index.html',
  './friscy.js',
  './friscy.wasm',
  './manifest.json',
  './network_bridge.js',
  './worker.js',
  './jit_manager.js',
  'https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css',
  'https://cdn.jsdelivr.net/npm/xterm@5.3.0/+esm',
  'https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/+esm',
];

// Files that change often — always fetch fresh (matched by filename, not full path)
const NETWORK_FIRST_FILES = new Set([
  'friscy.js',
  'friscy.wasm',
  'index.html',
  'manifest.json',
  'network_bridge.js',
  'worker.js',
  'jit_manager.js',
  'service-worker.js',
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

// Add COOP/COEP headers for cross-origin isolation (SharedArrayBuffer).
// Uses "credentialless" instead of "require-corp" — the latter blocks
// Worker scripts served via SW's new Response() constructor.
function addCOIHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// Add CORP header for cross-origin resources under COEP
function addCORPHeader(response) {
  const headers = new Headers(response.headers);
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// Fetch handler: caching + COOP/COEP header injection
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isCDN = url.hostname === 'cdn.jsdelivr.net';

  // Navigation: inject COOP/COEP + use network-first caching
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then((resp) => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone));
        }
        return addCOIHeaders(resp);
      }).catch(() =>
        caches.match(request).then(r =>
          r ? addCOIHeaders(r) : new Response('Offline', { status: 503 })
        )
      )
    );
    return;
  }

  // Cross-origin (CDN): fetch with CORS, add CORP header for COEP compatibility
  if (!isSameOrigin) {
    if (isCDN) {
      event.respondWith(
        caches.match(request).then((cached) => {
          if (cached) return addCORPHeader(cached);
          return fetch(request.url, { mode: 'cors', credentials: 'omit' }).then((resp) => {
            if (resp.ok) {
              const clone = resp.clone();
              caches.open(CACHE_NAME).then(c => c.put(request, clone));
            }
            return addCORPHeader(resp);
          });
        }).catch(() => fetch(request))
      );
    }
    // Non-CDN cross-origin: let pass through
    return;
  }

  // Same-origin subresources
  // Match by filename (works on both localhost and GH Pages subpath)
  const filename = url.pathname.split('/').pop() || '';
  const useNetworkFirst = NETWORK_FIRST_FILES.has(filename) || url.pathname.endsWith('/');

  if (useNetworkFirst) {
    event.respondWith(
      fetch(request).then((resp) => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone));
        }
        return addCOIHeaders(resp);
      }).catch(() =>
        caches.match(request).then(r =>
          r ? addCOIHeaders(r) : new Response('Offline', { status: 503 })
        )
      )
    );
  } else {
    // Cache-first for large assets (rootfs.tar, .wasm, etc.)
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return addCOIHeaders(cached);
        return fetch(request).then((resp) => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then(c => c.put(request, clone));
          }
          return addCOIHeaders(resp);
        });
      }).catch(() =>
        new Response('Offline', { status: 503 })
      )
    );
  }
});
