// Hook module resolution to log every import before it fails
import { register } from 'node:module';

// Collect all attempted imports
const seen = new Set();
const missing = [];

const origLoad = process._linkedBinding || null;

// Patch Module._resolveFilename to intercept
import module from 'node:module';

const origResolve = module._resolveFilename;
if (origResolve) {
  module._resolveFilename = function(request, ...args) {
    if (!seen.has(request)) {
      seen.add(request);
      console.error(`[IMPORT] ${request}`);
    }
    try {
      return origResolve.call(this, request, ...args);
    } catch(e) {
      if (!seen.has('MISSING:' + request)) {
        seen.add('MISSING:' + request);
        missing.push(request);
        console.error(`[MISSING] ${request}`);
      }
      throw e;
    }
  };
}
