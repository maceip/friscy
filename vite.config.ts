import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import webbundle from 'rollup-plugin-webbundle';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'inline', // Inline the registration to ensure it runs immediately
      manifest: false, // We point to it in index.html as .well-known/manifest.json
      workbox: {
        globPatterns: ['**/*.{js,css,html,wasm,svg,jpg,png}'],
        cleanupOutdatedCaches: true, // Force cleanup of old versions
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'nav-cache',
              expiration: { maxEntries: 1 }, // Reduce entries to prevent stale state
              networkTimeoutSeconds: 3,
            }
          }
        ]
      }
    }),
    /*
    webbundle({
        baseURL: 'https://friscy.dev/',
        primaryURL: 'https://friscy.dev/',
        output: 'friscy.wbn',
    })
    */
  ],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    fs: {
      allow: ['..']
    }
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['@xterm/xterm'],
  },
  build: {
    target: 'esnext',
    assetsInlineLimit: 0,
    sourcemap: false,
    minify: 'terser', // Ensure high-fidelity minification
  }
});
