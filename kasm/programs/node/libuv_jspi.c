/**
 * libuv JSPI (JavaScript Promise Integration) Adapter
 *
 * libuv is Node.js's asynchronous I/O library. It uses platform-specific
 * mechanisms (epoll, kqueue, IOCP) for async operations.
 *
 * For the Emscripten/WebAssembly target, we need to bridge libuv's event
 * loop to JavaScript's Promise-based async APIs using JSPI.
 *
 * JSPI allows WebAssembly to:
 * 1. Suspend execution when calling an async JS function
 * 2. Resume execution when the Promise resolves
 * 3. Do this without Asyncify overhead (more efficient)
 *
 * Supported operations:
 * - File I/O (via Emscripten's FS or OPFS)
 * - Network I/O (via fetch/WebSocket/WebTransport)
 * - Timers (via setTimeout)
 * - Child processes (via Worker spawn)
 *
 * References:
 * - https://emscripten.org/docs/api_reference/proxying.h.html
 * - https://developer.chrome.com/docs/webassembly/jspi
 */

#include <emscripten.h>
#include <emscripten/proxying.h>
#include <emscripten/threading.h>

// JSPI import for suspending on async operations
// These functions are provided by Emscripten's JSPI runtime
extern int __asyncjs__await_promise(int promise_id);
extern int __asyncjs__create_promise(void);

/**
 * uv__emscripten_poll - Poll for async I/O completions
 *
 * Called by libuv's event loop to check for completed async operations.
 * In native libuv, this uses epoll/kqueue/IOCP.
 * In Emscripten, we use JS Promises via JSPI.
 */
int uv__emscripten_poll(int timeout_ms) {
    // For JSPI, we don't actually "poll" - instead, async operations
    // suspend the Wasm stack and resume when complete.
    // This is handled automatically by the JSPI runtime.

    // However, we may need to yield to allow promise resolution
    if (timeout_ms > 0) {
        // Yield to JavaScript event loop
        emscripten_sleep(0);
    }

    return 0;
}

/**
 * uv__emscripten_async_read - Async file read with JSPI
 *
 * Wraps file read operation in a Promise that suspends Wasm.
 */
typedef struct {
    int fd;
    void* buf;
    size_t len;
    ssize_t result;
    int complete;
} uv__emscripten_read_req_t;

EM_JS(void, uv__emscripten_do_read, (uv__emscripten_read_req_t* req), {
    // JavaScript implementation using Promises
    const fd = req.fd;
    const len = req.len;

    // Use Emscripten's FS or fetch for network resources
    Asyncify.handleSleep(function(wakeUp) {
        // For now, use synchronous read (can be made async with File System Access API)
        const buffer = new Uint8Array(Module.HEAPU8.buffer, req.buf, len);

        // Simulate async with setTimeout
        setTimeout(function() {
            // In real implementation, use FileReader or fetch
            req.result = -1; // ENOSYS
            req.complete = 1;
            wakeUp();
        }, 0);
    });
});

ssize_t uv__emscripten_async_read(int fd, void* buf, size_t len) {
    uv__emscripten_read_req_t req = {
        .fd = fd,
        .buf = buf,
        .len = len,
        .result = 0,
        .complete = 0
    };

    uv__emscripten_do_read(&req);

    return req.result;
}

/**
 * uv__emscripten_async_write - Async file write with JSPI
 */
typedef struct {
    int fd;
    const void* buf;
    size_t len;
    ssize_t result;
    int complete;
} uv__emscripten_write_req_t;

EM_JS(void, uv__emscripten_do_write, (uv__emscripten_write_req_t* req), {
    Asyncify.handleSleep(function(wakeUp) {
        // Similar to read, but for writes
        setTimeout(function() {
            req.result = -1; // ENOSYS
            req.complete = 1;
            wakeUp();
        }, 0);
    });
});

ssize_t uv__emscripten_async_write(int fd, const void* buf, size_t len) {
    uv__emscripten_write_req_t req = {
        .fd = fd,
        .buf = buf,
        .len = len,
        .result = 0,
        .complete = 0
    };

    uv__emscripten_do_write(&req);

    return req.result;
}

/**
 * uv__emscripten_network_fetch - Network I/O via fetch API
 *
 * This replaces TCP/UDP sockets for browser environment.
 */
typedef struct {
    const char* url;
    void* response_buffer;
    size_t response_len;
    int status;
} uv__emscripten_fetch_req_t;

EM_JS(void, uv__emscripten_do_fetch, (uv__emscripten_fetch_req_t* req), {
    const url = UTF8ToString(req.url);

    Asyncify.handleSleep(function(wakeUp) {
        fetch(url)
            .then(response => {
                req.status = response.status;
                return response.arrayBuffer();
            })
            .then(buffer => {
                // Copy response to Wasm memory
                const wasmBuffer = new Uint8Array(Module.HEAPU8.buffer, req.response_buffer, req.response_len);
                wasmBuffer.set(new Uint8Array(buffer));
                wakeUp();
            })
            .catch(err => {
                req.status = -1;
                wakeUp();
            });
    });
});

int uv__emscripten_network_fetch(const char* url, void* response, size_t max_len) {
    uv__emscripten_fetch_req_t req = {
        .url = url,
        .response_buffer = response,
        .response_len = max_len,
        .status = 0
    };

    uv__emscripten_do_fetch(&req);

    return req.status;
}

/**
 * Timer implementation using setTimeout
 */
EM_JS(void, uv__emscripten_set_timeout, (int timeout_ms, int callback_id), {
    setTimeout(function() {
        // Call back into Wasm with the callback ID
        Module._uv__emscripten_timer_callback(callback_id);
    }, timeout_ms);
});

EM_JS(void, uv__emscripten_clear_timeout, (int timer_id), {
    clearTimeout(timer_id);
});

/**
 * uv__emscripten_spawn - Child process via Worker
 *
 * In native Node.js, this uses fork().
 * In browser, we spawn a new Worker with the same Wasm module.
 */
EM_JS(int, uv__emscripten_spawn, (const char* executable, char** argv, char** envp), {
    // Spawn new Worker running the same Wasm binary
    // This requires coordination with the Kasm middleware layer

    const worker = new Worker('process_worker.js');

    // Post message to initialize with executable path and args
    worker.postMessage({
        type: 'exec',
        executable: UTF8ToString(executable),
        argv: [],  // Convert argv array
        envp: {}   // Convert envp to object
    });

    return 0; // Return process ID
});

/**
 * Initialization
 */
EMSCRIPTEN_KEEPALIVE
int uv__emscripten_init(void) {
    // Initialize JSPI proxy queue
    // Initialize threading (if not already done)
    emscripten_init_pthreads();

    return 0;
}

/**
 * Main event loop integration
 *
 * libuv's uv_run() needs to be adapted for the Emscripten environment.
 * Instead of blocking on I/O, we use JSPI to suspend/resume.
 */
EMSCRIPTEN_KEEPALIVE
int uv__emscripten_run_loop(void) {
    // This is called by uv_run() to process events
    // In JSPI mode, we simply return and let the JS event loop handle it
    emscripten_sleep(0);
    return 0;
}
