// library_vectorheart.js — JSPI-Native Library for VectorHeart Hypercalls
//
// No Asyncify. Pure JSPI. Async functions use native `async` so the
// Emscripten linker wraps them with WebAssembly.Suspending via JSPI_IMPORTS.
//
// SAFETY CONTRACT:
//   - Async JS functions (js_opfs_io, js_net_proxy) have internal try/catch
//     and return -1 on error. They NEVER throw into the C++ stack.
//   - Sync JS functions (js_compute_offload, js_gettime_ms) are NOT on
//     JSPI_IMPORTS — zero suspension overhead for fast paths.
//   - This prevents JSPI stack suspension from conflicting with libriscv's
//     C++ exception-based control flow (-fwasm-exceptions).
//
// Build:
//   --js-library library_vectorheart.js
//   -sJSPI=1
//   -sJSPI_IMPORTS=['js_opfs_io','js_net_proxy','js_dns_resolve']

mergeInto(LibraryManager.library, {

  // Persistent state (survives JSPI suspend/resume cycles)
  $vhState: {
    files: new Map(),
    sockets: new Map()
  },

  // ========================================================================
  // [600s] FS / OPFS — Async (JSPI-suspended)
  //
  // Uses Origin Private File System with SyncAccessHandle (Worker-only).
  // Op codes match ecall numbers: 600=open, 601=write, 602=read,
  // 603=close, 604=pread
  // ========================================================================
  js_opfs_io__deps: ['$vhState'],
  js_opfs_io: async function(fd, ptr, len, op, off) {
    try {
      var root = await navigator.storage.getDirectory();

      if (op === 600) { // Open
        var path = UTF8ToString(ptr).replace(/\//g, '_');
        var handle = await root.getFileHandle(path, { create: true });
        var access = await handle.createSyncAccessHandle();
        var newFd = Math.floor(Math.random() * 1000) + 100;
        vhState.files.set(newFd, access);
        return newFd;
      }

      var handle = vhState.files.get(fd);
      if (!handle) return -9; // EBADF

      var buf = new Uint8Array(HEAPU8.buffer, ptr, len);

      if (op === 601) return handle.write(buf);
      if (op === 602) return handle.read(buf);
      if (op === 604) return handle.read(buf, { at: Number(off) });

      if (op === 603) {
        handle.close();
        vhState.files.delete(fd);
        return 0;
      }

      return -38; // ENOSYS
    } catch (e) {
      // SAFETY: Never throw into C++ — return error code instead
      console.error('[vh] OPFS error:', e);
      return -1;
    }
  },

  // ========================================================================
  // [800s] Networking — Async (JSPI-suspended)
  //
  // Synthetic socket layer. Writes buffer raw HTTP request data;
  // on read, if a complete request was buffered (\r\n\r\n), performs
  // fetch() and returns response body chunks.
  // ========================================================================
  js_net_proxy__deps: ['$vhState'],
  js_net_proxy: async function(fd, ip_ptr, port, op, buf_ptr, len) {
    try {
      if (op === 800) { // Connect
        var synthFd = 500 + (fd % 100);
        vhState.sockets.set(synthFd, {
          url: 'http://' + UTF8ToString(ip_ptr) + ':' + port + '/',
          req: '',
          res: null,
          pos: 0
        });
        return synthFd;
      }

      var s = vhState.sockets.get(fd);
      if (!s) return -9; // EBADF

      if (op === 802) { // Write (buffer request)
        s.req += UTF8ToString(buf_ptr, len);
        if (s.req.includes('\r\n\r\n')) {
          var r = await fetch(s.url);
          s.res = new Uint8Array(await r.arrayBuffer());
        }
        return len;
      }

      if (op === 803) { // Read (return response body)
        if (!s.res) return 0;
        var chunk = s.res.subarray(s.pos, s.pos + len);
        new Uint8Array(HEAPU8.buffer, buf_ptr, chunk.length).set(chunk);
        s.pos += chunk.length;
        return chunk.length;
      }

      return 0;
    } catch (e) {
      // SAFETY: Never throw into C++ — return error code instead
      console.error('[vh] net_proxy error:', e);
      return -1;
    }
  },

  // ========================================================================
  // DNS Resolution — Async (JSPI-suspended)
  //
  // Resolves hostname via hardcoded cache + Cloudflare DoH fallback.
  // ========================================================================
  js_dns_resolve: async function(host_ptr, host_len, ip_buf_ptr, ip_buf_len, port) {
    try {
      var hostname = UTF8ToString(host_ptr, host_len);

      // Fast path: well-known hosts
      var cache = {
        'api.anthropic.com': '160.79.104.10',
        'generativelanguage.googleapis.com': '142.250.80.106',
        'api.openai.com': '104.18.6.192',
        'httpbin.org': '34.198.16.126'
      };

      if (cache[hostname]) {
        stringToUTF8(cache[hostname], ip_buf_ptr, ip_buf_len);
        return 0;
      }

      // Slow path: DNS-over-HTTPS via Cloudflare
      var r = await fetch(
        'https://cloudflare-dns.com/dns-query?name=' +
          encodeURIComponent(hostname) + '&type=A',
        { headers: { 'Accept': 'application/dns-json' } }
      );
      var data = await r.json();
      if (data.Answer && data.Answer.length > 0) {
        stringToUTF8(data.Answer[data.Answer.length - 1].data, ip_buf_ptr, ip_buf_len);
        return 0;
      }
      return -1;
    } catch (e) {
      // SAFETY: Never throw into C++
      console.error('[vh] DNS error:', e);
      return -1;
    }
  },

  // ========================================================================
  // [700s] Compute — Sync (NOT on JSPI_IMPORTS — zero suspension overhead)
  //
  // Op codes: 705=getrandom, 703=memmove, 708=json_parse
  // ========================================================================
  js_compute_offload: function(op, p1, l1, p2, l2) {
    var mem = HEAPU8.buffer;

    if (op === 705) { // getrandom
      var offset = 0;
      while (offset < l1) {
        var chunk = Math.min(l1 - offset, 65536);
        crypto.getRandomValues(new Uint8Array(mem, p1 + offset, chunk));
        offset += chunk;
      }
      return l1;
    }

    if (op === 703) { // memmove
      new Uint8Array(mem, p1, l1).set(new Uint8Array(mem, p2, l2));
      return p1;
    }

    if (op === 708) { // JSON Teleportation
      try {
        // 1. Host-side native parse (JIT-accelerated V8, 10-100x faster than jitless guest)
        var jsonStr = UTF8ToString(p1, l1);
        var obj = JSON.parse(jsonStr);

        // 2. Minify and re-encode — strips whitespace, normalizes escapes,
        //    produces dense output that V8's parser ingests fastest
        var minified = JSON.stringify(obj);
        var result = new TextEncoder().encode(minified);

        // 3. Write-back into the shared guest buffer.
        //    Clamp to l1 to prevent overflow. If minified > l1 (rare: dense
        //    input + non-ASCII escape expansion), guest gets truncated output
        //    and should retry with a larger buffer (l1 + 128).
        var writeLen = Math.min(result.length, l1);
        new Uint8Array(HEAPU8.buffer, p1, writeLen).set(result.subarray(0, writeLen));

        // Return clamped length — guest slices buf[0..writeLen] for trivial re-parse
        return writeLen;
      } catch (e) {
        return -1; // Guest knows JSON was invalid without parsing it
      }
    }

    return 0;
  },

  // ========================================================================
  // Time — Sync (NOT on JSPI_IMPORTS)
  // Returns Date.now() as BigInt (-sWASM_BIGINT=1 required)
  // ========================================================================
  js_gettime_ms: function() {
    return BigInt(Date.now());
  }
});
