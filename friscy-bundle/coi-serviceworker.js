/*
 * coi-serviceworker - Cross-Origin Isolation Service Worker
 *
 * Injects COOP/COEP headers for SharedArrayBuffer support on hosts
 * that don't support custom response headers (e.g. GitHub Pages).
 *
 * Based on https://github.com/nicklockwood/coi-serviceworker (MIT license).
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
    const request = event.request;

    if (request.mode === 'navigate') {
        // Navigation: add COOP + COEP headers
        event.respondWith(
            fetch(request).then((response) => {
                const headers = new Headers(response.headers);
                headers.set('Cross-Origin-Opener-Policy', 'same-origin');
                headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
                return new Response(response.body, {
                    status: response.status,
                    statusText: response.statusText,
                    headers,
                });
            })
        );
    } else if (request.url.startsWith(self.location.origin)) {
        // Same-origin: pass through (already allowed by COEP)
        return;
    } else {
        // Cross-origin: re-fetch with CORS and tag with CORP header
        event.respondWith(
            fetch(request.url, { mode: 'cors', credentials: 'omit' })
                .then((response) => {
                    const headers = new Headers(response.headers);
                    headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
                    return new Response(response.body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers,
                    });
                })
                .catch(() => fetch(request))  // fallback to original request
        );
    }
});
