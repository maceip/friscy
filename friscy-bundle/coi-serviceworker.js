/*
 * coi-serviceworker - Cross-Origin Isolation Service Worker
 *
 * Injects Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy headers
 * so that SharedArrayBuffer works on hosts that don't support custom headers
 * (e.g. GitHub Pages).
 *
 * Based on https://github.com/nicklockwood/coi-serviceworker (MIT license).
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).then((response) => {
                const headers = new Headers(response.headers);
                headers.set('Cross-Origin-Opener-Policy', 'same-origin');
                headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
                return new Response(response.body, {
                    status: response.status,
                    statusText: response.statusText,
                    headers,
                });
            })
        );
    }
});
