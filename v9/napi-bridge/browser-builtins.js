/**
 * Browser-native implementations of Node.js built-in modules.
 *
 * EdgeJS compiles ~46 Node.js built-in modules to Wasm. Some of these
 * can be partially or fully replaced with browser-native APIs for
 * better performance and smaller Wasm size.
 *
 * This module provides the browser-side implementations that get
 * injected into EdgeJS's module resolution.
 */

/**
 * crypto — Web Crypto API bridge
 *
 * Node's crypto module uses OpenSSL compiled to Wasm.
 * For common operations, we can use the browser's Web Crypto API instead.
 */
export const cryptoBridge = {
  randomBytes(size) {
    const buf = new Uint8Array(size);
    crypto.getRandomValues(buf);
    return buf;
  },

  randomUUID() {
    return crypto.randomUUID();
  },

  async createHash(algorithm) {
    const algoMap = {
      'sha1': 'SHA-1',
      'sha256': 'SHA-256',
      'sha384': 'SHA-384',
      'sha512': 'SHA-512',
    };
    const webAlgo = algoMap[algorithm.toLowerCase()];
    if (!webAlgo) return null; // Fall back to Wasm OpenSSL

    let chunks = [];
    return {
      update(data) {
        if (typeof data === 'string') {
          data = new TextEncoder().encode(data);
        }
        chunks.push(data);
        return this;
      },
      async digest(encoding) {
        const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
        const combined = new Uint8Array(totalLen);
        let offset = 0;
        for (const chunk of chunks) {
          combined.set(chunk, offset);
          offset += chunk.length;
        }
        const hashBuffer = await crypto.subtle.digest(webAlgo, combined);
        const hashArray = new Uint8Array(hashBuffer);

        if (encoding === 'hex') {
          return Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('');
        }
        if (encoding === 'base64') {
          return btoa(String.fromCharCode(...hashArray));
        }
        return hashBuffer;
      }
    };
  },
};

/**
 * path — Pure JS (no Wasm needed)
 *
 * Node's path module is pure JS anyway, but EdgeJS compiles it.
 * We can provide it directly to avoid Wasm overhead.
 */
export const pathBridge = {
  sep: '/',
  delimiter: ':',

  join(...parts) {
    return this.normalize(parts.filter(Boolean).join('/'));
  },

  normalize(p) {
    const parts = p.split('/').filter(Boolean);
    const result = [];
    for (const part of parts) {
      if (part === '..') result.pop();
      else if (part !== '.') result.push(part);
    }
    return (p.startsWith('/') ? '/' : '') + result.join('/');
  },

  resolve(...parts) {
    let resolved = '';
    for (let i = parts.length - 1; i >= 0; i--) {
      resolved = parts[i] + '/' + resolved;
      if (parts[i].startsWith('/')) break;
    }
    return this.normalize(resolved);
  },

  dirname(p) {
    const idx = p.lastIndexOf('/');
    return idx === -1 ? '.' : p.substring(0, idx) || '/';
  },

  basename(p, ext) {
    let base = p.substring(p.lastIndexOf('/') + 1);
    if (ext && base.endsWith(ext)) {
      base = base.substring(0, base.length - ext.length);
    }
    return base;
  },

  extname(p) {
    const base = this.basename(p);
    const idx = base.lastIndexOf('.');
    return idx <= 0 ? '' : base.substring(idx);
  },

  isAbsolute(p) {
    return p.startsWith('/');
  },

  relative(from, to) {
    const fromParts = this.resolve(from).split('/').filter(Boolean);
    const toParts = this.resolve(to).split('/').filter(Boolean);
    let common = 0;
    while (common < fromParts.length && common < toParts.length &&
           fromParts[common] === toParts[common]) {
      common++;
    }
    const ups = fromParts.length - common;
    return [...Array(ups).fill('..'), ...toParts.slice(common)].join('/');
  },

  parse(p) {
    return {
      root: p.startsWith('/') ? '/' : '',
      dir: this.dirname(p),
      base: this.basename(p),
      ext: this.extname(p),
      name: this.basename(p, this.extname(p)),
    };
  },

  format(obj) {
    const dir = obj.dir || obj.root || '';
    const base = obj.base || (obj.name || '') + (obj.ext || '');
    return dir ? dir + '/' + base : base;
  },
};

/**
 * url — URL API bridge
 *
 * Modern browsers have URL and URLSearchParams natively.
 */
export const urlBridge = {
  URL: globalThis.URL,
  URLSearchParams: globalThis.URLSearchParams,

  parse(urlString) {
    try {
      return new URL(urlString);
    } catch {
      return null;
    }
  },

  format(urlObj) {
    if (urlObj instanceof URL) return urlObj.toString();
    const { protocol, hostname, port, pathname, search, hash } = urlObj;
    let result = '';
    if (protocol) result += protocol + '//';
    if (hostname) result += hostname;
    if (port) result += ':' + port;
    result += pathname || '/';
    if (search) result += search;
    if (hash) result += hash;
    return result;
  },
};

/**
 * process — Minimal process object for browser
 */
export const processBridge = {
  platform: 'browser',
  arch: 'wasm32',
  version: 'v20.0.0-edgejs',
  versions: {
    node: '20.0.0',
    v8: 'browser-native',
    edgejs: '0.1.0',
  },
  env: {},
  argv: ['node'],
  cwd() { return '/'; },
  exit(code) {
    console.log(`[process.exit] code=${code}`);
  },
  stdout: {
    write(data) { console.log(data); },
    isTTY: false,
  },
  stderr: {
    write(data) { console.error(data); },
    isTTY: false,
  },
  nextTick(fn, ...args) {
    queueMicrotask(() => fn(...args));
  },
  hrtime: {
    bigint() {
      return BigInt(Math.round(performance.now() * 1_000_000));
    },
  },
};

/**
 * Buffer — Uint8Array-based Buffer for browser
 *
 * Node's Buffer is used extensively. Provide core methods.
 */
export const bufferBridge = {
  from(data, encoding) {
    if (typeof data === 'string') {
      if (encoding === 'base64') {
        const binary = atob(data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
      }
      if (encoding === 'hex') {
        const bytes = new Uint8Array(data.length / 2);
        for (let i = 0; i < data.length; i += 2) {
          bytes[i / 2] = parseInt(data.substr(i, 2), 16);
        }
        return bytes;
      }
      return new TextEncoder().encode(data);
    }
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    return new Uint8Array(data);
  },

  alloc(size) {
    return new Uint8Array(size);
  },

  allocUnsafe(size) {
    return new Uint8Array(size);
  },

  concat(list, totalLength) {
    if (totalLength === undefined) {
      totalLength = list.reduce((sum, buf) => sum + buf.length, 0);
    }
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const buf of list) {
      result.set(buf, offset);
      offset += buf.length;
    }
    return result;
  },

  isBuffer(obj) {
    return obj instanceof Uint8Array;
  },
};

/**
 * Register browser builtins with EdgeJS module system.
 *
 * @param {object} edgeInstance - The EdgeJS Wasm instance
 */
export function registerBrowserBuiltins(edgeInstance) {
  const builtins = {
    'crypto': cryptoBridge,
    'path': pathBridge,
    'path/posix': pathBridge,
    'url': urlBridge,
    'buffer': { Buffer: bufferBridge },
    'process': processBridge,
  };

  // Inject into EdgeJS's module resolution
  // This is called after EdgeJS initializes, hooking into its require() chain
  for (const [name, impl] of Object.entries(builtins)) {
    if (edgeInstance._registerBuiltinOverride) {
      edgeInstance._registerBuiltinOverride(name, impl);
    }
  }

  return builtins;
}
