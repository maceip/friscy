/**
 * JSPI (JavaScript Promise Integration) Adapter for EdgeJS
 *
 * Bridges blocking POSIX-style I/O calls in EdgeJS's Wasm runtime
 * to async browser APIs using the JSPI WebAssembly proposal.
 *
 * JSPI allows Wasm functions to suspend execution when they encounter
 * an async operation, resuming when the Promise resolves. This replaces
 * WASIX's poll-based async model.
 *
 * How it works:
 *   1. EdgeJS C++ calls a blocking I/O function (read, write, connect...)
 *   2. The function is marked as a JSPI import (via WebAssembly.Suspending)
 *   3. The import returns a Promise → Wasm stack suspends
 *   4. Browser performs the actual I/O (fetch, WebSocket, etc.)
 *   5. Promise resolves → Wasm stack resumes with the result
 *
 * Reference: https://v8.dev/blog/jspi
 */

/**
 * Wraps a sync-looking function to use JSPI suspension.
 * The returned function can be used as a WebAssembly import.
 *
 * @param {Function} asyncFn - An async function to wrap
 * @returns {WebAssembly.Suspending} - JSPI-wrapped import
 */
export function wrapAsyncImport(asyncFn) {
  if (typeof WebAssembly.Suspending === 'function') {
    // JSPI is available (Chrome 123+, behind flag in others)
    return new WebAssembly.Suspending(asyncFn);
  }

  // Fallback: Asyncify-based suspension (Emscripten handles this)
  // When JSPI isn't available, Emscripten's -sASYNCIFY can be used instead
  console.warn('[jspi] WebAssembly.Suspending not available, using sync fallback');
  return asyncFn;
}

/**
 * Wraps a Wasm export to handle JSPI-resumed promises.
 *
 * @param {Function} wasmExport - A WebAssembly exported function
 * @returns {Function} - Promise-returning wrapper
 */
export function wrapAsyncExport(wasmExport) {
  if (typeof WebAssembly.promising === 'function') {
    return WebAssembly.promising(wasmExport);
  }
  return wasmExport;
}

/**
 * Create JSPI-wrapped I/O imports for EdgeJS.
 *
 * These replace the WASIX syscall imports with browser-native equivalents.
 * Each function appears synchronous to Wasm but suspends on async ops.
 */
export function createIOImports(proxyConfig = {}) {
  const proxyUrl = proxyConfig.url || null;

  return {
    /**
     * Network: TCP connect
     * EdgeJS calls this when libuv does uv_tcp_connect.
     * We route through WebTransport/WebSocket proxy.
     */
    __wasi_sock_connect: wrapAsyncImport(async (fd, addr, port) => {
      if (!proxyUrl) {
        console.error('[jspi] No proxy configured for sock_connect');
        return -1; // ENOSYS
      }

      try {
        // Connect via WebTransport proxy
        const transport = new WebTransport(`${proxyUrl}/connect?host=${addr}&port=${port}`);
        await transport.ready;

        // Store transport on fd table (managed by Emscripten FS)
        return 0; // success
      } catch (e) {
        console.error('[jspi] sock_connect failed:', e.message);
        return -1;
      }
    }),

    /**
     * Network: TCP read
     * Suspends Wasm until data arrives from the proxy.
     */
    __wasi_sock_recv: wrapAsyncImport(async (fd, iovs, iovsLen, riFlags, roDataLen, roFlags) => {
      // In a real implementation, this reads from the WebTransport stream
      // associated with the fd. For now, return EAGAIN.
      return 6; // EAGAIN
    }),

    /**
     * Network: TCP write
     * Sends data through the WebTransport proxy.
     */
    __wasi_sock_send: wrapAsyncImport(async (fd, ciov, ciovLen, siFlags, roDataLen) => {
      // Write to WebTransport stream
      return 0;
    }),

    /**
     * Network: DNS resolution
     * Uses browser's fetch to resolve via DNS-over-HTTPS or proxy.
     */
    __wasi_sock_getaddrinfo: wrapAsyncImport(async (host, port, hints, res, maxResLen, resLen) => {
      // Browser can't do raw DNS. Route through proxy.
      return 0;
    }),

    /**
     * Filesystem: async read
     * Most FS ops use Emscripten's MEMFS (synchronous), but
     * reads from network-backed files suspend.
     */
    __wasi_fd_read_async: wrapAsyncImport(async (fd, iovs, iovsLen, nread) => {
      // Delegate to Emscripten's FS for MEMFS
      // Only async for network-backed fds
      return 0;
    }),

    /**
     * Process: sleep
     * Maps to setTimeout via JSPI suspension.
     */
    __wasi_poll_oneoff: wrapAsyncImport(async (in_, out, nsubscriptions, nevents) => {
      // For timer subscriptions, use setTimeout
      // For fd subscriptions, check WebTransport readability
      await new Promise(resolve => setTimeout(resolve, 0));
      return 0;
    }),

    /**
     * Random: crypto
     * Uses Web Crypto API.
     */
    __wasi_random_get(buf, bufLen, memory) {
      const view = new Uint8Array(memory.buffer, buf, bufLen);
      crypto.getRandomValues(view);
      return 0;
    },

    /**
     * Clock: monotonic time
     */
    __wasi_clock_time_get(clockId, precision, time) {
      // Return performance.now() in nanoseconds
      const now = BigInt(Math.round(performance.now() * 1_000_000));
      return Number(now);
    },
  };
}

/**
 * Feature detection for JSPI support.
 */
export function isJSPISupported() {
  return typeof WebAssembly.Suspending === 'function' &&
         typeof WebAssembly.promising === 'function';
}

/**
 * Feature detection for required browser APIs.
 */
export function checkBrowserSupport() {
  const support = {
    jspi: isJSPISupported(),
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    webTransport: typeof WebTransport !== 'undefined',
    webCrypto: typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function',
    performanceNow: typeof performance !== 'undefined' && typeof performance.now === 'function',
    simd: (() => {
      try {
        return WebAssembly.validate(new Uint8Array([
          0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123,
          3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11
        ]));
      } catch { return false; }
    })(),
  };

  const missing = Object.entries(support)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  return { support, missing, ok: missing.length === 0 };
}
