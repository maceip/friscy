// worker.js - Web Worker entry point for friscy emulator
//
// Runs the Emscripten-compiled RISC-V emulator in a dedicated Worker thread.
// Communicates with the main thread via SharedArrayBuffer + Atomics for:
//   - stdout/stderr output (ring buffer, worker writes, main reads)
//   - stdin input (Atomics.wait blocks worker until main provides data)
//   - network RPC (socket operations via main thread's WebTransport)
//   - control commands (start, stop, resize terminal)
//
// This eliminates JSPI and setTimeout polling -- the worker can block freely
// on Atomics.wait() without freezing the browser UI.

// Lazy-load JIT manager (non-critical — Worker must not fail if unavailable)
let jitManager = { jitCompiler: null, init() {}, loadCompiler() { return Promise.resolve(); }, execute() { return null; }, recordExecution() {} };
let installInvalidationHook = () => {};
try {
    const jitMod = await import('./jit_manager.js');
    jitManager = jitMod.default;
    installInvalidationHook = jitMod.installInvalidationHook;
} catch (e) {
    console.warn('[worker] JIT manager not available:', e.message);
}

// Control SAB layout (4KB):
//   [0]   i32: command   (0=idle, 1=stdout, 2=stdin_request, 3=stdin_ready,
//                          4=exit, 5=network_rpc, 6=resize, 7=network_rpc_done)
//   [4]   i32: status    (0=pending, 1=ready, 2=error)
//   [8]   i32: length    (payload size)
//   [12]  i32: fd        (file descriptor)
//   [16]  i32: result    (return value)
//   [20]  i32: exit_code
//   [24]  i32: cols      (terminal columns)
//   [28]  i32: rows      (terminal rows)
//   [64+] u8[3968]: payload

const CMD_IDLE = 0;
const CMD_STDOUT = 1;
const CMD_STDIN_REQUEST = 2;
const CMD_STDIN_READY = 3;
const CMD_EXIT = 4;
const CMD_NETWORK_RPC = 5;
const CMD_RESIZE = 6;
const CMD_NETWORK_RPC_DONE = 7;

const STATUS_PENDING = 0;
const STATUS_READY = 1;

// Network RPC operation codes (stored in payload[0])
const NET_OP_SOCKET_CREATE = 1;
const NET_OP_CONNECT = 2;
const NET_OP_BIND = 3;
const NET_OP_LISTEN = 4;
const NET_OP_ACCEPT = 5;
const NET_OP_SEND = 6;
const NET_OP_RECV = 7;
const NET_OP_CLOSE = 8;
const NET_OP_HAS_DATA = 9;
const NET_OP_HAS_PENDING_ACCEPT = 10;
const NET_OP_SETSOCKOPT = 11;
const NET_OP_GETSOCKOPT = 12;
const NET_OP_SHUTDOWN = 13;

// Ring buffer layout (64KB stdout_sab):
//   [0]   i32: write_head (worker writes here)
//   [4]   i32: read_tail  (main reads here)
//   [8+]  u8[65528]: ring data

const RING_HEADER = 8;
const RING_SIZE = 65528;

// Network SAB layout (64KB net_sab):
//   [0]   i32: lock       (Atomics.wait/notify coordination)
//   [4]   i32: op         (NET_OP_*)
//   [8]   i32: fd         (socket file descriptor)
//   [12]  i32: arg1       (operation-specific)
//   [16]  i32: arg2       (operation-specific)
//   [20]  i32: result     (return value from main thread)
//   [24]  i32: data_len   (payload data length)
//   [64+] u8[65472]: data payload (for send/recv/connect address)

const NET_HEADER = 64;
const NET_DATA_SIZE = 65472;

let controlView = null;
let controlBytes = null;
let stdoutView = null;
let stdoutBytes = null;
let netView = null;
let netBytes = null;
let emModule = null;

const encoder = new TextEncoder();

/**
 * Write bytes to the stdout ring buffer.
 * Non-blocking: if ring is full, drops data (should not happen with 64KB buffer).
 */
function writeStdoutRing(data) {
    if (!stdoutView || !stdoutBytes) return;

    const writeHead = Atomics.load(stdoutView, 0);
    const readTail = Atomics.load(stdoutView, 1);

    // Available space in ring
    let available;
    if (writeHead >= readTail) {
        available = RING_SIZE - (writeHead - readTail) - 1;
    } else {
        available = readTail - writeHead - 1;
    }

    const len = Math.min(data.length, available);
    if (len === 0) return;

    let pos = writeHead;
    for (let i = 0; i < len; i++) {
        stdoutBytes[RING_HEADER + pos] = data[i];
        pos = (pos + 1) % RING_SIZE;
    }

    // Update write head (atomic store)
    Atomics.store(stdoutView, 0, pos);

    // Notify main thread that stdout data is available
    Atomics.notify(stdoutView, 0);
}

/**
 * Request stdin data from main thread.
 * Blocks until main thread provides input via CMD_STDIN_READY.
 * Returns Uint8Array of input bytes.
 */
function requestStdin(maxLen) {
    if (!controlView) return new Uint8Array(0);

    // Write stdin request
    Atomics.store(controlView, 2, maxLen); // length = max bytes wanted
    Atomics.store(controlView, 0, CMD_STDIN_REQUEST);
    Atomics.notify(controlView, 0); // wake main thread

    // Block until main thread sets command to CMD_STDIN_READY
    while (true) {
        const cmd = Atomics.load(controlView, 0);
        if (cmd === CMD_STDIN_READY) break;
        Atomics.wait(controlView, 0, cmd, 100); // 100ms timeout, retry
    }

    const len = Atomics.load(controlView, 2);
    if (len <= 0) return new Uint8Array(0);

    // Read payload
    const result = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        result[i] = controlBytes[64 + i];
    }

    // Reset to idle
    Atomics.store(controlView, 0, CMD_IDLE);
    return result;
}

/**
 * Send a network RPC to the main thread and block until response.
 * The main thread handles the actual WebTransport/network operations.
 *
 * @param {number} op - NET_OP_* code
 * @param {number} fd - socket file descriptor
 * @param {number} arg1 - operation-specific argument
 * @param {number} arg2 - operation-specific argument
 * @param {Uint8Array|null} data - optional payload data
 * @returns {{ result: number, data: Uint8Array|null }}
 */
function networkRPC(op, fd, arg1, arg2, data) {
    if (!netView) return { result: -38, data: null }; // ENOSYS

    // Write RPC request to network SAB
    Atomics.store(netView, 1, op);
    Atomics.store(netView, 2, fd);
    Atomics.store(netView, 3, arg1);
    Atomics.store(netView, 4, arg2);

    if (data && data.length > 0) {
        const len = Math.min(data.length, NET_DATA_SIZE);
        Atomics.store(netView, 6, len);
        netBytes.set(data.subarray(0, len), NET_HEADER);
    } else {
        Atomics.store(netView, 6, 0);
    }

    // Signal main thread: RPC request ready
    Atomics.store(netView, 0, 1); // lock = 1 (request pending)
    Atomics.notify(netView, 0);

    // Block until main thread sets lock = 2 (response ready)
    while (true) {
        const lock = Atomics.load(netView, 0);
        if (lock === 2) break;
        Atomics.wait(netView, 0, lock, 100); // 100ms timeout, retry
    }

    // Read response
    const result = Atomics.load(netView, 5);
    const respLen = Atomics.load(netView, 6);
    let respData = null;
    if (respLen > 0) {
        respData = new Uint8Array(respLen);
        for (let i = 0; i < respLen; i++) {
            respData[i] = netBytes[NET_HEADER + i];
        }
    }

    // Reset lock to idle
    Atomics.store(netView, 0, 0);

    return { result, data: respData };
}

/**
 * Signal program exit to main thread.
 */
function signalExit(exitCode) {
    if (!controlView) return;
    Atomics.store(controlView, 5, exitCode); // exit_code at offset 20
    Atomics.store(controlView, 0, CMD_EXIT);
    Atomics.notify(controlView, 0);
}

/**
 * Run the resume loop: call friscy_resume() while machine is stopped for stdin.
 * Between each resume, block on Atomics.wait() for the main thread to provide stdin.
 * Integrates JIT: checks for compiled functions before falling back to interpreter.
 */
function runResumeLoop() {
    const friscy_stopped = emModule._friscy_stopped;
    const friscy_resume = emModule._friscy_resume;
    const friscy_get_pc = emModule._friscy_get_pc;
    const friscy_set_pc = emModule._friscy_set_pc;
    const friscy_get_state_ptr = emModule._friscy_get_state_ptr;

    while (friscy_stopped()) {
        // Request stdin from main thread (blocks until data arrives)
        const stdinData = requestStdin(4096);

        // Push received bytes into the Module's stdin buffer
        if (stdinData.length > 0) {
            for (let i = 0; i < stdinData.length; i++) {
                emModule._stdinBuffer.push(stdinData[i]);
            }
        }

        // Try JIT execution before falling back to interpreter
        let jitHandled = false;
        if (jitManager.jitCompiler) {
            const pc = friscy_get_pc();
            const jitResult = jitManager.execute(pc, friscy_get_state_ptr());
            if (jitResult) {
                jitHandled = true;
                if (jitResult.isHalt) return;
                if (jitResult.isSyscall) {
                    friscy_set_pc(jitResult.nextPC & 0x7FFFFFFF);
                } else {
                    friscy_set_pc(jitResult.nextPC);
                }
            } else {
                jitManager.recordExecution(pc);
            }
        }

        // Resume interpreter
        const stillStopped = friscy_resume();
        if (!stillStopped) {
            // Machine finished (guest called exit)
            return;
        }
    }
}

// Global error handler — surface errors to main thread
self.addEventListener('error', (e) => {
    console.error('[worker] Uncaught error:', e.message, e.filename, e.lineno);
    self.postMessage({ type: 'error', message: `${e.message} (${e.filename}:${e.lineno})` });
});
self.addEventListener('unhandledrejection', (e) => {
    console.error('[worker] Unhandled rejection:', e.reason);
    self.postMessage({ type: 'error', message: String(e.reason) });
});

// Handle messages from main thread
self.onmessage = async function(e) {
    const msg = e.data;

    if (msg.type === 'init') {
        try {
        // Receive SharedArrayBuffers and configuration
        const controlSab = msg.controlSab;
        const stdoutSab = msg.stdoutSab;
        const netSab = msg.netSab;

        controlView = new Int32Array(controlSab);
        controlBytes = new Uint8Array(controlSab);
        stdoutView = new Int32Array(stdoutSab);
        stdoutBytes = new Uint8Array(stdoutSab);

        if (netSab) {
            netView = new Int32Array(netSab);
            netBytes = new Uint8Array(netSab);
        }

        // Store initial terminal dimensions from control SAB
        const initCols = Atomics.load(controlView, 6); // offset 24
        const initRows = Atomics.load(controlView, 7); // offset 28

        console.log('[worker] crossOriginIsolated:', self.crossOriginIsolated);
        console.log('[worker] SharedArrayBuffer available:', typeof SharedArrayBuffer !== 'undefined');
        if (!self.crossOriginIsolated) {
            throw new Error('Worker not cross-origin isolated — COOP/COEP headers missing. SharedArrayBuffer unavailable.');
        }

        console.log('[worker] Loading Emscripten module...');
        // Load Emscripten module (ES module import)
        const { default: createFriscy } = await import('./friscy.js');
        console.log('[worker] createFriscy loaded, instantiating...');

        // Stdin buffer shared between Module callbacks and resume loop
        const stdinBuffer = [];

        // Configure and instantiate Emscripten module
        console.log('[worker] Calling createFriscy...');
        emModule = await createFriscy({
            noInitialRun: true,
            print: function(text) {
                console.log('[friscy]', text);
                writeStdoutRing(encoder.encode(text + '\n'));
            },
            printErr: function(text) {
                // Debug output (C++ fprintf(stderr)) goes to console only,
                // NOT to the terminal ring buffer. Guest I/O uses _termWrite.
                console.error('[friscy-err]', text);
            },
            // _termWrite routes stdout through the ring buffer to main thread
            _termWrite: function(text) {
                writeStdoutRing(encoder.encode(text));
            },
            _decoder: new TextDecoder(),
            _stdinBuffer: stdinBuffer,
            _stdinEOF: false,
            _termRows: initRows || 24,
            _termCols: initCols || 80,
            // Override stdin to use SAB blocking
            stdin: function() {
                // If buffer has data, return from it
                if (stdinBuffer.length > 0) {
                    return stdinBuffer.shift();
                }
                // Otherwise block for stdin from main thread
                const data = requestStdin(1);
                return data.length > 0 ? data[0] : null;
            },
            onExit: function(code) {
                signalExit(code);
            },
        });

        // Install JIT invalidation hook on Module
        installInvalidationHook(emModule);

        // Initialize JIT manager with the Wasm memory
        const wasmMemory = emModule.wasmMemory || (emModule.asm && emModule.asm.memory);
        if (wasmMemory) {
            jitManager.init(wasmMemory);
            // Load JIT compiler (async, non-blocking)
            jitManager.loadCompiler('rv2wasm_jit_bg.wasm').catch(e => {
                console.warn('[worker] JIT compiler not available:', e.message);
            });
        }

        // Install network callbacks that route through SAB RPC
        if (netSab) {
            emModule.onSocketCreated = function(fd, domain, type) {
                networkRPC(NET_OP_SOCKET_CREATE, fd, domain, type, null);
            };
            emModule.onSocketConnect = function(fd, addrData) {
                const { result } = networkRPC(NET_OP_CONNECT, fd, 0, 0,
                    new Uint8Array(addrData.buffer, addrData.byteOffset, addrData.byteLength));
                return result;
            };
            emModule.onSocketBind = function(fd, addrData) {
                const { result } = networkRPC(NET_OP_BIND, fd, 0, 0,
                    new Uint8Array(addrData.buffer, addrData.byteOffset, addrData.byteLength));
                return result;
            };
            emModule.onSocketListen = function(fd, backlog) {
                const { result } = networkRPC(NET_OP_LISTEN, fd, backlog, 0, null);
                return result;
            };
            emModule.onSocketAccept = function(fd) {
                const resp = networkRPC(NET_OP_ACCEPT, fd, 0, 0, null);
                if (resp.result < 0) return resp.result;
                return { fd: resp.result, addr: resp.data };
            };
            emModule.onSocketSend = function(fd, data) {
                const { result } = networkRPC(NET_OP_SEND, fd, 0, 0,
                    data instanceof Uint8Array ? data : new Uint8Array(data));
                return result;
            };
            emModule.onSocketClosed = function(fd) {
                const { result } = networkRPC(NET_OP_CLOSE, fd, 0, 0, null);
                return result;
            };
            emModule.onSocketShutdown = function(fd, how) {
                const { result } = networkRPC(NET_OP_SHUTDOWN, fd, how, 0, null);
                return result;
            };
            emModule.hasSocketData = function(fd) {
                const { result } = networkRPC(NET_OP_HAS_DATA, fd, 0, 0, null);
                return result > 0;
            };
            emModule.readSocketData = function(fd, maxLen) {
                const resp = networkRPC(NET_OP_RECV, fd, maxLen, 0, null);
                if (resp.result <= 0 || !resp.data) return null;
                return Array.from(resp.data);
            };
            emModule.hasPendingAccept = function(fd) {
                const { result } = networkRPC(NET_OP_HAS_PENDING_ACCEPT, fd, 0, 0, null);
                return result > 0;
            };
        }

        console.log('[worker] Module ready, sending ready message');
        self.postMessage({ type: 'ready' });
        } catch (e) {
            console.error('[worker] Init failed:', e.message, e.stack);
            self.postMessage({ type: 'error', message: e.message, stack: e.stack });
        }
    }

    if (msg.type === 'run') {
        // Start emulator execution
        const args = msg.args || [];

        try {
            if (msg.rootfsData) {
                // Write rootfs tar to Emscripten VFS
                emModule.FS.writeFile('/rootfs.tar', new Uint8Array(msg.rootfsData));
            }

            // Run with arguments
            emModule.callMain(args);

            // Enter resume loop if machine stopped for stdin
            if (emModule._friscy_stopped && emModule._friscy_stopped()) {
                runResumeLoop();
            }

            // Machine finished — signal exit
            signalExit(0);
        } catch (e) {
            writeStdoutRing(encoder.encode(`\r\n[worker] Error: ${e.message}\r\n`));
            signalExit(1);
        }
    }

    if (msg.type === 'resize') {
        // Update terminal dimensions
        if (emModule) {
            emModule._termRows = msg.rows || 24;
            emModule._termCols = msg.cols || 80;
        }
    }
};
