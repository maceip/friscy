/**
 * N-API Browser Bridge for EdgeJS
 *
 * This module provides N-API function implementations that bridge
 * EdgeJS's C++ runtime (compiled to Wasm) to the browser's native
 * JS engine. It replaces the Wasmer host's N-API provider.
 *
 * In EdgeJS's architecture:
 *   - WASIX mode: N-API functions imported from Wasmer host
 *   - Browser mode: N-API functions imported from THIS bridge
 *
 * The bridge is loaded as Emscripten library imports, so each
 * function is available to the Wasm module via WebAssembly.imports.
 *
 * Reference: https://nodejs.org/api/n-api.html
 */

// N-API status codes (mirrors napi_status enum)
const NAPI_OK = 0;
const NAPI_INVALID_ARG = 1;
const NAPI_OBJECT_EXPECTED = 2;
const NAPI_STRING_EXPECTED = 3;
const NAPI_NAME_EXPECTED = 4;
const NAPI_FUNCTION_EXPECTED = 5;
const NAPI_NUMBER_EXPECTED = 6;
const NAPI_BOOLEAN_EXPECTED = 7;
const NAPI_GENERIC_FAILURE = 9;
const NAPI_PENDING_EXCEPTION = 10;

// N-API value types
const NAPI_UNDEFINED = 0;
const NAPI_NULL = 1;
const NAPI_BOOLEAN = 2;
const NAPI_NUMBER = 3;
const NAPI_STRING = 4;
const NAPI_SYMBOL = 5;
const NAPI_OBJECT = 6;
const NAPI_FUNCTION = 7;
const NAPI_EXTERNAL = 8;
const NAPI_BIGINT = 9;

/**
 * NapiBridge manages the mapping between Wasm-side napi_value handles
 * and real JavaScript values in the browser.
 */
class NapiBridge {
  constructor(wasmModule) {
    this.wasm = wasmModule;
    this.memory = null; // Set when module initializes

    // Handle table: maps integer handles ↔ JS values
    // Handle 0 = undefined, 1 = null, 2 = global
    this.handles = [undefined, null, globalThis];
    this.handleFreeList = [];

    // Reference counting for prevent GC
    this.refs = new Map(); // handle → refcount

    // Persistent pointers from Wasm → handle scope stack
    this.handleScopes = [[]];
  }

  // --- Handle Management ---

  /** Allocate a handle for a JS value, return integer handle */
  createHandle(value) {
    // Check if value is already a well-known handle
    if (value === undefined) return 0;
    if (value === null) return 1;
    if (value === globalThis) return 2;

    let handle;
    if (this.handleFreeList.length > 0) {
      handle = this.handleFreeList.pop();
      this.handles[handle] = value;
    } else {
      handle = this.handles.length;
      this.handles.push(value);
    }

    // Track in current handle scope
    const currentScope = this.handleScopes[this.handleScopes.length - 1];
    currentScope.push(handle);

    return handle;
  }

  /** Resolve integer handle to JS value */
  getHandle(handle) {
    if (handle < 0 || handle >= this.handles.length) {
      throw new Error(`Invalid napi handle: ${handle}`);
    }
    return this.handles[handle];
  }

  /** Free a handle */
  freeHandle(handle) {
    if (handle <= 2) return; // Don't free well-known handles
    this.handles[handle] = undefined;
    this.handleFreeList.push(handle);
  }

  // --- Handle Scopes ---

  openHandleScope() {
    this.handleScopes.push([]);
    return NAPI_OK;
  }

  closeHandleScope() {
    const scope = this.handleScopes.pop();
    if (!scope) return NAPI_GENERIC_FAILURE;

    // Free all handles in this scope (unless ref'd)
    for (const handle of scope) {
      if (!this.refs.has(handle)) {
        this.freeHandle(handle);
      }
    }
    return NAPI_OK;
  }

  // --- Wasm Memory Helpers ---

  /** Read a UTF-8 string from Wasm memory */
  readString(ptr, len) {
    if (!this.memory) return '';
    const bytes = new Uint8Array(this.memory.buffer, ptr, len);
    return new TextDecoder().decode(bytes);
  }

  /** Write a UTF-8 string to Wasm memory, return bytes written */
  writeString(ptr, str, maxLen) {
    if (!this.memory) return 0;
    const bytes = new TextEncoder().encode(str);
    const writeLen = Math.min(bytes.length, maxLen - 1);
    const target = new Uint8Array(this.memory.buffer, ptr, writeLen + 1);
    target.set(bytes.subarray(0, writeLen));
    target[writeLen] = 0; // null terminator
    return writeLen;
  }

  /** Write a 32-bit integer to Wasm memory */
  writeI32(ptr, value) {
    if (!this.memory) return;
    new Int32Array(this.memory.buffer, ptr, 1)[0] = value;
  }

  /** Write a 64-bit float to Wasm memory */
  writeF64(ptr, value) {
    if (!this.memory) return;
    new Float64Array(this.memory.buffer, ptr, 1)[0] = value;
  }

  // --- N-API Function Implementations ---

  /**
   * Generate the import object for Emscripten's WebAssembly.instantiate
   * These are the N-API functions that EdgeJS's Wasm expects to import.
   */
  getImports() {
    const bridge = this;

    return {
      // --- Value Creation ---
      napi_create_int32(env, value, resultPtr) {
        bridge.writeI32(resultPtr, bridge.createHandle(value));
        return NAPI_OK;
      },

      napi_create_uint32(env, value, resultPtr) {
        bridge.writeI32(resultPtr, bridge.createHandle(value >>> 0));
        return NAPI_OK;
      },

      napi_create_int64(env, value, resultPtr) {
        bridge.writeI32(resultPtr, bridge.createHandle(value));
        return NAPI_OK;
      },

      napi_create_double(env, value, resultPtr) {
        bridge.writeI32(resultPtr, bridge.createHandle(value));
        return NAPI_OK;
      },

      napi_create_string_utf8(env, strPtr, length, resultPtr) {
        const str = bridge.readString(strPtr, length === -1 ?
          new Uint8Array(bridge.memory.buffer).indexOf(0, strPtr) - strPtr : length);
        bridge.writeI32(resultPtr, bridge.createHandle(str));
        return NAPI_OK;
      },

      napi_create_object(env, resultPtr) {
        bridge.writeI32(resultPtr, bridge.createHandle({}));
        return NAPI_OK;
      },

      napi_create_array(env, resultPtr) {
        bridge.writeI32(resultPtr, bridge.createHandle([]));
        return NAPI_OK;
      },

      napi_create_function(env, namePtr, nameLen, cb, data, resultPtr) {
        const name = namePtr ? bridge.readString(namePtr, nameLen) : 'anonymous';
        const fn = function (...args) {
          // Call back into Wasm: cb(env, cbinfo)
          // cbinfo contains: this, args, data
          // This requires Emscripten's dynCall support
          return bridge.wasm.dynCall(cb, env, args, data);
        };
        Object.defineProperty(fn, 'name', { value: name });
        bridge.writeI32(resultPtr, bridge.createHandle(fn));
        return NAPI_OK;
      },

      // --- Value Getters ---
      napi_get_value_int32(env, handle, resultPtr) {
        const value = bridge.getHandle(handle);
        bridge.writeI32(resultPtr, value | 0);
        return NAPI_OK;
      },

      napi_get_value_double(env, handle, resultPtr) {
        const value = bridge.getHandle(handle);
        bridge.writeF64(resultPtr, +value);
        return NAPI_OK;
      },

      napi_get_value_bool(env, handle, resultPtr) {
        const value = bridge.getHandle(handle);
        bridge.writeI32(resultPtr, value ? 1 : 0);
        return NAPI_OK;
      },

      napi_get_value_string_utf8(env, handle, bufPtr, bufSize, resultPtr) {
        const str = String(bridge.getHandle(handle));
        if (bufPtr && bufSize > 0) {
          const written = bridge.writeString(bufPtr, str, bufSize);
          if (resultPtr) bridge.writeI32(resultPtr, written);
        } else if (resultPtr) {
          bridge.writeI32(resultPtr, new TextEncoder().encode(str).length);
        }
        return NAPI_OK;
      },

      // --- Property Access ---
      napi_set_named_property(env, objHandle, namePtr, valueHandle) {
        const obj = bridge.getHandle(objHandle);
        const name = bridge.readString(namePtr,
          new Uint8Array(bridge.memory.buffer).indexOf(0, namePtr) - namePtr);
        obj[name] = bridge.getHandle(valueHandle);
        return NAPI_OK;
      },

      napi_get_named_property(env, objHandle, namePtr, resultPtr) {
        const obj = bridge.getHandle(objHandle);
        const name = bridge.readString(namePtr,
          new Uint8Array(bridge.memory.buffer).indexOf(0, namePtr) - namePtr);
        bridge.writeI32(resultPtr, bridge.createHandle(obj[name]));
        return NAPI_OK;
      },

      napi_has_named_property(env, objHandle, namePtr, resultPtr) {
        const obj = bridge.getHandle(objHandle);
        const name = bridge.readString(namePtr,
          new Uint8Array(bridge.memory.buffer).indexOf(0, namePtr) - namePtr);
        bridge.writeI32(resultPtr, name in obj ? 1 : 0);
        return NAPI_OK;
      },

      // --- Function Calls ---
      napi_call_function(env, thisHandle, fnHandle, argc, argvPtr, resultPtr) {
        const thisVal = bridge.getHandle(thisHandle);
        const fn = bridge.getHandle(fnHandle);
        const args = [];
        for (let i = 0; i < argc; i++) {
          const argHandle = new Int32Array(bridge.memory.buffer, argvPtr + i * 4, 1)[0];
          args.push(bridge.getHandle(argHandle));
        }
        try {
          const result = fn.apply(thisVal, args);
          if (resultPtr) {
            bridge.writeI32(resultPtr, bridge.createHandle(result));
          }
          return NAPI_OK;
        } catch (e) {
          return NAPI_PENDING_EXCEPTION;
        }
      },

      // --- Type Checking ---
      napi_typeof(env, handle, resultPtr) {
        const value = bridge.getHandle(handle);
        let type;
        switch (typeof value) {
          case 'undefined': type = NAPI_UNDEFINED; break;
          case 'boolean': type = NAPI_BOOLEAN; break;
          case 'number': type = NAPI_NUMBER; break;
          case 'string': type = NAPI_STRING; break;
          case 'symbol': type = NAPI_SYMBOL; break;
          case 'function': type = NAPI_FUNCTION; break;
          case 'bigint': type = NAPI_BIGINT; break;
          case 'object':
            type = value === null ? NAPI_NULL : NAPI_OBJECT;
            break;
          default: type = NAPI_UNDEFINED;
        }
        bridge.writeI32(resultPtr, type);
        return NAPI_OK;
      },

      // --- Handle Scopes ---
      napi_open_handle_scope(env, resultPtr) {
        bridge.openHandleScope();
        bridge.writeI32(resultPtr, bridge.handleScopes.length - 1);
        return NAPI_OK;
      },

      napi_close_handle_scope(env, scope) {
        return bridge.closeHandleScope();
      },

      // --- Global & Undefined ---
      napi_get_global(env, resultPtr) {
        bridge.writeI32(resultPtr, 2); // handle 2 = globalThis
        return NAPI_OK;
      },

      napi_get_undefined(env, resultPtr) {
        bridge.writeI32(resultPtr, 0); // handle 0 = undefined
        return NAPI_OK;
      },

      napi_get_null(env, resultPtr) {
        bridge.writeI32(resultPtr, 1); // handle 1 = null
        return NAPI_OK;
      },

      napi_get_boolean(env, value, resultPtr) {
        bridge.writeI32(resultPtr, bridge.createHandle(!!value));
        return NAPI_OK;
      },

      // --- Error Handling ---
      napi_throw_error(env, codePtr, msgPtr) {
        const msg = bridge.readString(msgPtr,
          new Uint8Array(bridge.memory.buffer).indexOf(0, msgPtr) - msgPtr);
        console.error(`[napi] Error: ${msg}`);
        return NAPI_OK;
      },

      napi_is_exception_pending(env, resultPtr) {
        bridge.writeI32(resultPtr, 0); // no exception pending
        return NAPI_OK;
      },

      // --- References ---
      napi_create_reference(env, handle, initialRefcount, resultPtr) {
        bridge.refs.set(handle, initialRefcount);
        bridge.writeI32(resultPtr, handle);
        return NAPI_OK;
      },

      napi_delete_reference(env, ref) {
        bridge.refs.delete(ref);
        return NAPI_OK;
      },

      // --- Module Registration ---
      napi_module_register(mod) {
        // Called by EdgeJS C++ to register built-in modules
        // The mod pointer contains the module descriptor
        console.log('[napi] Module registered');
        return NAPI_OK;
      },
    };
  }
}

/**
 * Initialize EdgeJS in the browser.
 *
 * @param {object} options
 * @param {string} options.wasmUrl - URL to edgejs.wasm
 * @param {object} options.env - Environment variables
 * @param {object} options.fs - Virtual filesystem initial contents
 * @returns {Promise<object>} EdgeJS runtime instance
 */
export async function initEdgeJS(options = {}) {
  const bridge = new NapiBridge(null);

  // Load the Emscripten-generated module
  const { default: EdgeJSModule } = await import(options.moduleUrl || './edgejs.js');

  const instance = await EdgeJSModule({
    // Inject N-API bridge imports
    napiImports: bridge.getImports(),

    // Environment variables (for API keys etc.)
    ENV: {
      HOME: '/home/user',
      PATH: '/usr/bin:/bin',
      NODE_ENV: 'production',
      ...options.env,
    },

    // Emscripten callbacks
    onRuntimeInitialized() {
      bridge.memory = instance.HEAP8.buffer;
      console.log('[edgejs] Runtime initialized');
    },

    // Filesystem pre-population
    preRun: [
      function (mod) {
        if (options.fs) {
          for (const [path, content] of Object.entries(options.fs)) {
            const dir = path.substring(0, path.lastIndexOf('/'));
            mod.FS.mkdirTree(dir);
            mod.FS.writeFile(path, content);
          }
        }
      },
    ],

    // stdout/stderr capture
    print: options.onStdout || console.log,
    printErr: options.onStderr || console.error,
  });

  return {
    /** Run a JavaScript string */
    eval(code) {
      return instance.ccall('edge_eval', 'number', ['string'], [code]);
    },

    /** Run a JavaScript file from the virtual filesystem */
    runFile(path) {
      return instance.ccall('edge_run_file', 'number', ['string'], [path]);
    },

    /** Access the virtual filesystem */
    fs: instance.FS,

    /** Raw Emscripten module (for advanced use) */
    module: instance,
  };
}

export { NapiBridge };
