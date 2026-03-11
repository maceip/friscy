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

console.log('[worker] Module loading...');

// JIT manager — loaded lazily inside init
let jitManager = {
    jitCompiler: null,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    init(_m) {},
    loadCompiler() { return Promise.resolve(); },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    execute(_p, _s) { return null; },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    recordExecution(_p) {},
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    recordTraceTransition(_f, _t) {},
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    configureTiering(_c) {},
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    configureScheduler(_c) {},
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    configurePredictor(_c) {},
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    configureTrace(_c) {},
    getStats() { return null; },
};
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let installInvalidationHook = (_m) => {};
let lastJitStatsPostMs = 0;
const JIT_STATS_POST_INTERVAL_MS = 250;

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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const CMD_STDOUT = 1;
const CMD_STDIN_REQUEST = 2;
const CMD_STDIN_READY = 3;
const CMD_EXIT = 4;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const CMD_NETWORK_RPC = 5;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const CMD_RESIZE = 6;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const CMD_NETWORK_RPC_DONE = 7;
const CMD_EXPORT_VFS = 8;
const CMD_EXPORT_CHECKPOINT = 9;

const PROCESS_EVENT_KIND_SPAWN = 1;
const PROCESS_EVENT_KIND_EXIT = 2;
const PROCESS_EVENT_KIND_WAIT_WAKEUP = 3;
const PROCESS_EVENT_KIND_WAIT_BLOCKED = 4;
const PROCESS_EVENT_RECORD_DWORDS = 5;

const STOP_REASON_NONE = 0;
const STOP_REASON_STDIN = 1 << 0;
const STOP_REASON_HOST_FETCH = 1 << 1;
const STOP_REASON_TIMESLICE = 1 << 2;
const STOP_REASON_WAIT_CHILD = 1 << 3;
const FRISCY_FAULT_NONE = 0;
const FRISCY_FAULT_MACHINE_EXCEPTION = 1;
const FRISCY_FAULT_EBREAK = 2;

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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const NET_OP_SETSOCKOPT = 11;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
let timesliceResumeEnabled = true;

function redactUrlForLog(url) {
    try {
        const u = new URL(String(url || ''));
        if (u.searchParams.has('key')) {
            u.searchParams.set('key', '[REDACTED]');
        }
        return u.toString();
    } catch (_e) {
        return String(url || '');
    }
}
let jitPrewarmEnabled = true;

let netWorker = null;
let netRpcId = 1;
const pendingRpcs = new Map();
const syntheticSockets = new Map();
const syntheticRecvLogCount = new Map();
let processDrainResolved = false;
let processDrainMissingLogged = false;
let processEventsDirectPathSeen = false;
let lastProcessExitStatus = null;
let lastProcessWaitWakeStatus = null;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function parseSockaddr(addrData) {
    if (!addrData || addrData.length < 8) return null;
    const dv = new DataView(addrData.buffer, addrData.byteOffset, addrData.byteLength);
    const family = dv.getUint16(0, true);
    if (family === 2 && addrData.length >= 8) {
        const port = (addrData[2] << 8) | addrData[3];
        const host = `${addrData[4]}.${addrData[5]}.${addrData[6]}.${addrData[7]}`;
        return { family, host, port };
    }
    if (family === 10 && addrData.length >= 28) {
        const port = (addrData[2] << 8) | addrData[3];
        const parts = [];
        for (let i = 8; i < 24; i += 2) {
            parts.push(((addrData[i] << 8) | addrData[i + 1]).toString(16));
        }
        const host = parts.join(':');
        return { family, host, port };
    }
    return null;
}

function syntheticHttpFetch(sock) {
    const req = sock.req;
    if (!req || sock.inflight) return;
    const headerEnd = req.indexOf('\r\n\r\n');
    if (headerEnd < 0) return;
    sock.inflight = true;

    try {
        const head = req.slice(0, headerEnd);
        const lines = head.split('\r\n');
        const requestLine = lines[0] || 'GET / HTTP/1.1';
        const m = requestLine.match(/^([A-Z]+)\s+(\S+)\s+HTTP\/\d\.\d$/);
        const method = m ? m[1] : 'GET';
        let path = m ? m[2] : '/';
        let hostHeader = '';
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (/^host:/i.test(line)) {
                hostHeader = line.slice(5).trim();
                break;
            }
        }
        const authority = hostHeader || (sock.port ? `${sock.host}:${sock.port}` : sock.host);
        if (!/^https?:\/\//i.test(path)) {
            path = `http://${authority}${path.startsWith('/') ? '' : '/'}${path}`;
        }
        console.log(`[worker][synth-net] fetch ${method} ${path}`);

        const bodyStart = headerEnd + 4;
        const bodyBytes = encoder.encode(req.slice(bodyStart));
        const opts = { method, headers: {}, body: undefined };
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            const idx = line.indexOf(':');
            if (idx <= 0) continue;
            const k = line.slice(0, idx).trim();
            const v = line.slice(idx + 1).trim();
            if (!k) continue;
            if (k.toLowerCase() === 'host') continue;
            opts.headers[k] = v;
        }
        if (bodyBytes.length > 0 && method !== 'GET' && method !== 'HEAD') {
            opts.body = bodyBytes;
        }

        let status = 0;
        let statusText = '';
        let respBody = new Uint8Array(0);
        const respHeaders = {};
        let useProxy = false;
        try {
            const target = new URL(path, self.location?.origin || undefined);
            useProxy = !!(self.hostFetchProxy && self.location && target.origin !== self.location.origin);
        } catch (_e) {
            useProxy = false;
        }

        if (useProxy && typeof XMLHttpRequest === 'function') {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', self.hostFetchProxy, false);
            xhr.setRequestHeader('content-type', 'application/json');
            xhr.send(JSON.stringify({ url: path, options: opts }));
            if (xhr.status !== 200) {
                throw new Error(`host fetch proxy status ${xhr.status}`);
            }
            const proxyJson = JSON.parse(xhr.responseText || '{}');
            status = Number(proxyJson?.status || 0);
            statusText = String(proxyJson?.statusText || '');
            const hdrs = proxyJson?.headers || {};
            for (const [k, v] of Object.entries(hdrs)) {
                respHeaders[String(k).toLowerCase()] = String(v);
            }
            respBody = encoder.encode(String(proxyJson?.body || ''));
        } else {
            throw new Error('no synchronous host fetch bridge available');
        }

        if (!Number.isFinite(status) || status <= 0) {
            throw new Error('network fetch failed');
        }
        console.log(`[worker][synth-net] fetch status=${status}`);
        let headerText = `HTTP/1.1 ${status} ${statusText}\r\n`;
        for (const [k, v] of Object.entries(respHeaders)) {
            const lk = String(k).toLowerCase();
            if (lk === 'content-length' || lk === 'transfer-encoding' || lk === 'content-encoding' || lk === 'connection') {
                continue;
            }
            headerText += `${k}: ${v}\r\n`;
        }
        headerText += 'connection: close\r\n';
        headerText += `content-length: ${respBody.length}\r\n\r\n`;
        const headerBytes = encoder.encode(headerText);
        const packet = new Uint8Array(headerBytes.length + respBody.length);
        packet.set(headerBytes, 0);
        packet.set(respBody, headerBytes.length);
        sock.recv.push(packet);
        sock.eof = true;
    } catch (e) {
        const errMsg = `HTTP/1.1 502 Bad Gateway\r\ncontent-type: text/plain\r\n\r\n${String(e?.message || e)}`;
        sock.recv.push(encoder.encode(errMsg));
        sock.eof = true;
    } finally {
        sock.req = '';
        sock.inflight = false;
    }
}

function buildDnsQueryUrl(payload) {
    const bytes = payload instanceof Uint8Array ? payload : new Uint8Array(payload || 0);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const b64url = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    return `https://cloudflare-dns.com/dns-query?dns=${b64url}`;
}

function syntheticDnsFetchSync(payload) {
    if (typeof XMLHttpRequest !== 'function') return null;
    try {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', buildDnsQueryUrl(payload), false);
        xhr.responseType = 'arraybuffer';
        xhr.setRequestHeader('Accept', 'application/dns-message');
        xhr.send(null);
        if (xhr.status !== 200 || !xhr.response) return null;
        const out = new Uint8Array(xhr.response);
        return out.length ? out : null;
    } catch (_e) {
        return null;
    }
}

async function syntheticDnsFetch(sock, payload) {
    try {
        const r = await fetch(buildDnsQueryUrl(payload), {
            headers: { Accept: 'application/dns-message' },
        });
        if (!r.ok) return;
        const out = new Uint8Array(await r.arrayBuffer());
        if (out.length) sock.recv.push(out);
    } catch (_e) {
        // keep socket non-fatal; guest will handle EAGAIN/timeout
    } finally {
        sock.inflight = false;
    }
}

/**
 * Write bytes to the stdout ring buffer.
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

    Atomics.store(stdoutView, 0, pos);
    Atomics.notify(stdoutView, 0);
}

/**
 * Request stdin data from main thread.
 */
function requestStdin(maxLen) {
    if (!controlView || !controlBytes) return new Uint8Array(0);
    // callMain() can run for a long time without returning in the interactive
    // shell path. Drain process events opportunistically on stdin boundaries
    // so process lifecycle events are surfaced while the VM is running.
    drainProcessEvents();

    Atomics.store(controlView, 2, maxLen);
    Atomics.store(controlView, 0, CMD_STDIN_REQUEST);
    Atomics.notify(controlView, 0);

    while (true) {
        const cmd = Atomics.load(controlView, 0);
        if (cmd === CMD_STDIN_READY) break;
        Atomics.wait(controlView, 0, cmd, 100);
    }

    const len = Atomics.load(controlView, 2);
    if (len <= 0) return new Uint8Array(0);

    const result = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        result[i] = controlBytes[64 + i];
    }

    Atomics.store(controlView, 0, CMD_IDLE);
    drainProcessEvents();
    return result;
}

/**
 * Send a network RPC to the main thread and block until response.
 */
function networkRPC(op, fd, arg1, arg2, data) {
    if (!netWorker) {
        // No WebTransport proxy: synthetic HTTP socket bridge via fetch.
        if (op === NET_OP_SOCKET_CREATE) {
            syntheticSockets.set(fd, {
                fd,
                req: '',
                recv: [],
                host: '',
                port: 0,
                connected: false,
                inflight: false,
                eof: false,
                type: arg2 | 0,
                domain: arg1 | 0,
            });
            return { result: 0, data: null };
        }
        const sock = syntheticSockets.get(fd);
        if (!sock) return { result: -9, data: null };
        if (op === NET_OP_CONNECT) {
            const parsed = parseSockaddr(data || new Uint8Array(0));
            if (parsed) {
                sock.host = parsed.host;
                sock.port = parsed.port;
            }
            sock.connected = true;
            sock.eof = false;
            console.log(`[worker][synth-net] connect fd=${fd} host=${sock.host} port=${sock.port}`);
            return { result: 0, data: null };
        }
        if (op === NET_OP_SEND) {
            const payload = data || new Uint8Array(0);
            const copied = new Uint8Array(payload.length);
            copied.set(payload);
            sock.req += decoder.decode(copied);
            if (payload.length > 0) {
                console.log(`[worker][synth-net] send fd=${fd} bytes=${payload.length}`);
            }
            if (sock.type === 2) {
                // UDP DNS needs a response queued before c-ares checks socket
                // readability again. Prefer a synchronous DoH query in the
                // worker thread; fall back to async fetch if XHR is unavailable.
                const syncResp = syntheticDnsFetchSync(copied);
                if (syncResp && syncResp.length) {
                    sock.recv.push(syncResp);
                    sock.inflight = false;
                } else {
                    sock.inflight = true;
                    syntheticDnsFetch(sock, copied).catch(() => {});
                }
                return { result: payload.length, data: null };
            }
            // Fire and forget; recv will pick up buffered response.
            syntheticHttpFetch(sock);
            return { result: payload.length, data: null };
        }
        if (op === NET_OP_RECV) {
            if (!sock.recv.length) {
                if (sock.eof) {
                    sock.eof = false;
                    return { result: 0, data: null };
                }
                const c = (syntheticRecvLogCount.get(fd) || 0) + 1;
                syntheticRecvLogCount.set(fd, c);
                if (c <= 8) {
                    console.log(`[worker][synth-net] recv fd=${fd} EAGAIN inflight=${sock.inflight} q=${sock.recv.length}`);
                }
                return { result: -11, data: null }; // EAGAIN
            }
            const buf = sock.recv[0];
            const maxLen = Math.max(0, arg1 | 0);
            const n = Math.min(maxLen, buf.length);
            const out = buf.slice(0, n);
            if (n === buf.length) sock.recv.shift();
            else sock.recv[0] = buf.slice(n);
            console.log(`[worker][synth-net] recv fd=${fd} bytes=${out.length}`);
            return { result: out.length, data: out };
        }
        if (op === NET_OP_HAS_DATA) {
            return { result: (sock.recv.length > 0 || sock.eof) ? 1 : 0, data: null };
        }
        if (op === NET_OP_CLOSE || op === NET_OP_SHUTDOWN) {
            syntheticSockets.delete(fd);
            return { result: 0, data: null };
        }
        return { result: 0, data: null };
    }

    // Modern isolated network lane via net_lane_worker
    const id = netRpcId++;
    let payload = null;
    let transfer = [];
    if (data && data.length > 0) {
        // Avoid transferring a SharedArrayBuffer-backed view directly.
        const copied = new Uint8Array(data.length);
        copied.set(data);
        payload = copied.buffer;
        transfer = [payload];
    }

    netWorker.postMessage({
        type: 'rpc', id, op, fd, arg1, arg2, 
        data: payload
    }, transfer);

    // We still have to block the worker thread so Wasm doesn't continue until the socket responds
    // Emscripten Asyncify could be used, but since we are in a worker, Atomics is easier.
    // However, since netWorker runs asynchronously, it cannot wake us if we block on `Atomics.wait` 
    // unless another thread updates it.
    // So we use Atomics.wait on `netView` to sleep, and let the `onmessage` of `netWorker` wake us up!
    
    Atomics.store(netView, 0, 1);
    Atomics.store(netView, 7, id);
    
    const t0 = Date.now();
    while (true) {
        const lock = Atomics.load(netView, 0);
        if (lock === 2 && Atomics.load(netView, 7) === id) break;
        Atomics.wait(netView, 0, lock, 100);
        if (Date.now() - t0 > 10000) {
            Atomics.store(netView, 0, 0);
            return { result: -110, data: null }; // ETIMEDOUT
        }
    }

    const result = Atomics.load(netView, 5);
    const respLen = Atomics.load(netView, 6);
    let respData = null;
    if (respLen > 0) {
        respData = new Uint8Array(respLen);
        for (let i = 0; i < respLen; i++) {
            respData[i] = netBytes[NET_HEADER + i];
        }
    }

    Atomics.store(netView, 0, 0);
    return { result, data: respData };
}

/**
 * Signal program exit to main thread.
 */
function signalExit(exitCode) {
    if (!controlView) return;
    Atomics.store(controlView, 5, exitCode);
    Atomics.store(controlView, 0, CMD_EXIT);
    Atomics.notify(controlView, 0);
}

function maybePostJitStats(force = false) {
    if (!jitManager || typeof jitManager.getStats !== 'function') return;
    const now = Date.now();
    if (!force && now - lastJitStatsPostMs < JIT_STATS_POST_INTERVAL_MS) return;
    lastJitStatsPostMs = now;
    try {
        const stats = jitManager.getStats();
        if (stats) {
            self.postMessage({ type: 'jit_stats', stats, ts: now });
        }
    } catch (_e) {
        // ignore
    }
}

function getRuntimeFaultInfo() {
    const kind = (typeof emModule?._friscy_get_last_fault_kind === 'function')
        ? (emModule._friscy_get_last_fault_kind() | 0)
        : FRISCY_FAULT_NONE;
    const pc = (typeof emModule?._friscy_get_last_fault_pc === 'function')
        ? (emModule._friscy_get_last_fault_pc() >>> 0)
        : 0;
    const data = (typeof emModule?._friscy_get_last_fault_data === 'function')
        ? (emModule._friscy_get_last_fault_data() >>> 0)
        : 0;
    return { kind, pc, data };
}

function getRuntimeStateSnapshot() {
    const stopped = (typeof emModule?._friscy_stopped === 'function')
        ? !!emModule._friscy_stopped()
        : false;
    const stopReason = getStopReason(emModule?._friscy_stop_reason, emModule?._friscy_stopped);
    const pc = (typeof emModule?._friscy_get_pc === 'function')
        ? (emModule._friscy_get_pc() >>> 0)
        : 0;
    return {
        stopped,
        stopReason,
        pc,
        fault: getRuntimeFaultInfo(),
        processExitStatus: lastProcessExitStatus,
        processWaitWakeStatus: lastProcessWaitWakeStatus,
    };
}

function logRuntimeState(prefix) {
    try {
        console.log(`${prefix} ${JSON.stringify(getRuntimeStateSnapshot())}`);
    } catch (e) {
        console.log(`${prefix} <state-unavailable:${e?.message || e}>`);
    }
}

function classifyRunFailure(error) {
    const snapshot = getRuntimeStateSnapshot();
    const stopped = snapshot.stopped;
    const stopReason = snapshot.stopReason;
    const fault = snapshot.fault;
    const processExitSuccess = (lastProcessExitStatus === 0) || (lastProcessWaitWakeStatus === 0);
    const processExitFailure =
        (lastProcessExitStatus !== null && lastProcessExitStatus !== 0) ||
        (lastProcessWaitWakeStatus !== null && lastProcessWaitWakeStatus !== 0);
    const message = error?.message || String(error || '');
    const mentionsEbreak = typeof message === 'string' && message.includes('EBREAK');

    const gracefulByRuntime = stopped && stopReason === STOP_REASON_NONE
        && (fault.kind === FRISCY_FAULT_NONE || fault.kind === FRISCY_FAULT_EBREAK);
    const graceful = processExitSuccess || gracefulByRuntime;

    return {
        graceful,
        diagnostics: {
            stopped,
            stopReason,
            faultKind: fault.kind,
            faultPc: fault.pc,
            faultData: fault.data,
            processExitStatus: lastProcessExitStatus,
            processWaitWakeStatus: lastProcessWaitWakeStatus,
            processExitSuccess,
            processExitFailure,
            mentionsEbreak,
        },
    };
}

async function resumeEscapedRunFault(errMsg) {
    if (typeof emModule?._friscy_resume !== 'function') {
        return false;
    }

    logRuntimeState(`[worker] pre-resume escaped callMain fault (${errMsg})`);
    const loopOutcome = await runResumeLoop({ forceInitialResume: true });
    drainProcessEvents();
    logRuntimeState(`[worker] post-runResumeLoop escaped callMain fault (${errMsg}) outcome=${loopOutcome}`);

    if (loopOutcome === 'too_many_faults' || loopOutcome === 'resume_exception' || loopOutcome === 'control_sab_missing') {
        return false;
    }

    const after = getRuntimeStateSnapshot();
    const processExitSuccess = after.processExitStatus === 0 || after.processWaitWakeStatus === 0;
    const processExitFailure =
        (after.processExitStatus !== null && after.processExitStatus !== 0) ||
        (after.processWaitWakeStatus !== null && after.processWaitWakeStatus !== 0);
    const terminalFault = after.fault.kind !== FRISCY_FAULT_NONE;

    if (processExitFailure || terminalFault) {
        console.warn(`[worker] escaped callMain fault recovery ended in non-graceful state (${errMsg})`);
        return false;
    }

    if (processExitSuccess || !after.stopped) {
        return true;
    }

    return false;
}

function drainProcessEvents() {
    if (processEventsDirectPathSeen) return;
    const direct = emModule?._friscy_drain_process_events;
    const wasmExport = emModule?.wasmExports?.friscy_drain_process_events;
    const drain = typeof direct === 'function' ? direct : wasmExport;
    if (!processDrainResolved && typeof drain === 'function') {
        processDrainResolved = true;
        console.log('[worker] Process drain export resolved');
    }
    if (typeof drain !== 'function' || !emModule._malloc || !emModule._free) {
        if (!processDrainMissingLogged) {
            processDrainMissingLogged = true;
            console.warn('[worker] Process drain export missing');
        }
        return;
    }

    const maxEvents = 8;
    const ptr = emModule._malloc(maxEvents * PROCESS_EVENT_RECORD_DWORDS * 4);
    if (!ptr) return;

    try {
        const n = drain(ptr, maxEvents) >>> 0;
        if (n <= 0) return;
        const raw = new Uint32Array(emModule.HEAPU32.buffer, ptr, n * PROCESS_EVENT_RECORD_DWORDS);
        const events = [];
        const kindName = (k) => {
            switch (k) {
            case PROCESS_EVENT_KIND_SPAWN:
                return 'spawn';
            case PROCESS_EVENT_KIND_EXIT:
                return 'exit';
            case PROCESS_EVENT_KIND_WAIT_WAKEUP:
                return 'wait_wakeup';
            case PROCESS_EVENT_KIND_WAIT_BLOCKED:
                return 'wait_blocked';
            default:
                return 'unknown';
            }
        };
        for (let i = 0; i < n; i++) {
            const base = i * PROCESS_EVENT_RECORD_DWORDS;
            const event = {
                kind: raw[base] | 0,
                kindName: kindName(raw[base] | 0),
                pid: raw[base + 1] | 0,
                ppid: raw[base + 2] | 0,
                pgid: raw[base + 3] | 0,
                status: raw[base + 4] | 0,
            };
            if (event.kind === PROCESS_EVENT_KIND_EXIT) {
                lastProcessExitStatus = event.status | 0;
            } else if (event.kind === PROCESS_EVENT_KIND_WAIT_WAKEUP) {
                lastProcessWaitWakeStatus = event.status | 0;
            }
            events.push(event);
        }
        self._lastProcessEvents = events;
        self.postMessage({ type: 'process-events', events });
    } catch (e) {
        console.warn('[worker] Failed to drain process events:', e.message);
    } finally {
        emModule._free(ptr);
    }
}

function getStopReason(friscy_stop_reason, friscy_stopped) {
    if (typeof friscy_stop_reason === 'function') {
        const mask = friscy_stop_reason() | 0;
        if (Number.isFinite(mask) && mask !== 0) return mask;
        // Some transitions report mask=0 while still stopped; don't exit early.
        return (typeof friscy_stopped === 'function' && friscy_stopped())
            ? STOP_REASON_STDIN
            : STOP_REASON_NONE;
    }
    // Backwards compatibility with older runtimes.
    return (typeof friscy_stopped === 'function' && friscy_stopped())
        ? STOP_REASON_STDIN
        : STOP_REASON_NONE;
}

function exportLiveCheckpointBytes() {
    if (!emModule) throw new Error('Module not initialized');
    const sizePtr = emModule._malloc(4);
    const liveExport = emModule._friscy_save_live_checkpoint || emModule._friscy_export_checkpoint;
    if (!liveExport) {
        emModule._free(sizePtr);
        throw new Error('No checkpoint export function available');
    }
    const dataPtr = liveExport(sizePtr);
    const size = Number(emModule.HEAPU32[Number(sizePtr) >> 2]);
    emModule._free(sizePtr);
    if (!dataPtr || size <= 0) {
        throw new Error('Live checkpoint export returned empty payload');
    }
    const ptr = Number(dataPtr) >>> 0;
    const len = size >>> 0;
    const heapLen = emModule.HEAPU8.byteLength >>> 0;
    if (len === 0 || ptr + len > heapLen) {
        throw new Error(`Live checkpoint buffer out of bounds (ptr=${ptr} size=${len} heap=${heapLen})`);
    }
    const copy = new Uint8Array(emModule.HEAPU8.buffer, ptr, len).slice();
    if (liveExport !== emModule._friscy_save_live_checkpoint) emModule._free(dataPtr);
    return copy;
}

/**
 * Run the resume loop.
 */
async function runResumeLoop(options = {}) {
    console.log('[worker] entering resume loop');
    let forceInitialResume = !!options.forceInitialResume;
    let resumeCount = 0;
    const loopStartMs = Date.now();
    const telemetry = {
        stopStdin: 0,
        stopHostFetch: 0,
        stopTimeslice: 0,
        stopWaitChild: 0,
        timesliceResumeAttempts: 0,
        resumeThrows: 0,
        recoveredThrows: 0,
        jitSuppressedByFaults: 0,
        jitDispatches: 0,
        jitFallbacks: 0,
        jitDirectRuns: 0,
        jitRegionMisses: 0,
        jitSyscalls: 0,
        jitHalts: 0,
    };
    let telemetryFlushed = false;
    const flushTelemetry = (outcome) => {
        if (telemetryFlushed) return;
        telemetryFlushed = true;
        const elapsedMs = Date.now() - loopStartMs;
        let jitSummary = null;
        try {
            if (jitManager && typeof jitManager.getStats === 'function') {
                const s = jitManager.getStats();
                jitSummary = {
                    compiledRegionCount: s?.compiledRegionCount ?? null,
                    compileFailures: s?.compileFailures ?? null,
                    queueDepth: s?.queueDepth ?? null,
                    prewarmAttempts: s?.prewarmAttempts ?? null,
                    prewarmSuccesses: s?.prewarmSuccesses ?? null,
                    prewarmFailures: s?.prewarmFailures ?? null,
                    compilerPrewarmed: s?.compilerPrewarmed ?? null,
                    firstCompileLatencyMs: s?.firstCompileLatencyMs ?? null,
                };
            }
        } catch (_e) {
            // ignore stats fetch errors
        }
        console.log(`[worker] resume telemetry ${JSON.stringify({
            outcome,
            elapsedMs,
            resumeCount,
            timesliceResumeEnabled,
            ...telemetry,
            jitSummary,
        })}`);
    };
    const friscy_stopped = emModule._friscy_stopped;
    const friscy_stop_reason = emModule._friscy_stop_reason;
    const friscy_resume = emModule._friscy_resume;
    const friscy_get_pc = emModule._friscy_get_pc;
    const friscy_set_pc = emModule._friscy_set_pc;
    const friscy_get_state_ptr = emModule._friscy_get_state_ptr;
    const friscy_host_fetch_pending = emModule._friscy_host_fetch_pending;
    const friscy_get_fetch_request = emModule._friscy_get_fetch_request;
    const friscy_get_fetch_request_len = emModule._friscy_get_fetch_request_len;
    const friscy_set_fetch_response = emModule._friscy_set_fetch_response;
    let consecutiveResumeThrows = 0;
    let suppressJitDispatch = false;

    while (true) {
        const rawStopReason = getStopReason(friscy_stop_reason, friscy_stopped);
        if (rawStopReason & STOP_REASON_STDIN) telemetry.stopStdin++;
        if (rawStopReason & STOP_REASON_HOST_FETCH) telemetry.stopHostFetch++;
        if (rawStopReason & STOP_REASON_TIMESLICE) telemetry.stopTimeslice++;
        if (rawStopReason & STOP_REASON_WAIT_CHILD) telemetry.stopWaitChild++;
        const stopReason = timesliceResumeEnabled
            ? rawStopReason
            : (rawStopReason & ~STOP_REASON_TIMESLICE);
        const shouldForceResume = forceInitialResume && stopReason === STOP_REASON_NONE;

        if (stopReason === STOP_REASON_NONE && !shouldForceResume) {
            flushTelemetry('finished');
            console.log(`[worker] resume loop: machine finished after ${resumeCount} resumes`);
            return 'finished';
        }
        if (shouldForceResume) {
            forceInitialResume = false;
            console.log('[worker] resume loop: forcing initial resume with stopReason=0');
        }
        if (!controlView || !controlBytes) break;

        const currentCmd = Atomics.load(controlView, 0);
        if (currentCmd === CMD_EXPORT_VFS) {
            Atomics.store(controlView, 0, CMD_IDLE);
            if (emModule._friscy_export_tar) {
                try {
                    const sizePtr = emModule._malloc(4);
                    const dataPtr = emModule._friscy_export_tar(sizePtr);
                    const size = emModule.HEAPU32[sizePtr >> 2];
                    emModule._free(sizePtr);
                    if (dataPtr && size > 0) {
                        const tarData = emModule.HEAPU8.slice(dataPtr, dataPtr + size).buffer;
                        emModule._free(dataPtr);
                        self.postMessage({ type: 'vfs_export', tarData }, [tarData]);
                    }
                } catch (e) {
                    console.error('[worker] VFS export failed:', e.message);
                }
            }
        } else if (currentCmd === CMD_EXPORT_CHECKPOINT) {
            Atomics.store(controlView, 0, CMD_IDLE);
            try {
                const copy = exportLiveCheckpointBytes();
                self.postMessage({
                    type: 'checkpoint-exported-live',
                    data: copy,
                    metrics: { bytes: copy.length },
                }, [copy.buffer]);
            } catch (e) {
                console.error('[worker] Live export failed in resume loop:', e.message, e.stack);
                self.postMessage({ type: 'checkpoint-export-error', message: e.message, stack: e.stack });
            }
        }

        if (stopReason & STOP_REASON_STDIN) {
            let receivedStdin = false;
            const cmd = Atomics.load(controlView, 0);
            if (cmd === CMD_STDIN_READY) {
                const len = Atomics.load(controlView, 2);
                if (len > 0) {
                    for (let i = 0; i < len; i++) {
                        emModule._stdinBuffer.push(controlBytes[64 + i]);
                    }
                    receivedStdin = true;
                }
                Atomics.store(controlView, 0, CMD_IDLE);
            } else {
                Atomics.store(controlView, 2, 4096);
                Atomics.store(controlView, 0, CMD_STDIN_REQUEST);
                Atomics.notify(controlView, 0);
                Atomics.wait(controlView, 0, CMD_STDIN_REQUEST, 100);
                const newCmd = Atomics.load(controlView, 0);
                if (newCmd === CMD_STDIN_READY) {
                    const len = Atomics.load(controlView, 2);
                    if (len > 0) {
                        for (let i = 0; i < len; i++) {
                            emModule._stdinBuffer.push(controlBytes[64 + i]);
                        }
                        receivedStdin = true;
                    }
                    Atomics.store(controlView, 0, CMD_IDLE);
                } else {
                    // Keep request visible to the UI so automation/users can
                    // gate command injection on explicit stdin demand.
                    Atomics.store(controlView, 0, CMD_STDIN_REQUEST);
                }
            }
            if (!receivedStdin) {
                await new Promise((r) => setTimeout(r, 10));
                continue;
            }
        }
        drainProcessEvents();
        maybePostJitStats();

        if ((stopReason & STOP_REASON_HOST_FETCH) && friscy_host_fetch_pending && friscy_host_fetch_pending()) {
            try {
                const reqPtr = friscy_get_fetch_request();
                const reqLen = friscy_get_fetch_request_len();
                const reqPtrU = reqPtr >>> 0;
                const reqLenU = reqLen >>> 0;
                const reqBytes = new Uint8Array(emModule.HEAPU8.buffer, reqPtrU, reqLenU);
                const reqJSON = new TextDecoder().decode(reqBytes.slice());
                const req = JSON.parse(reqJSON);

                if (!self.allowNetwork) {
                    throw new Error("Sandbox policy prohibits external network requests.");
                }

                console.log(`[worker] host-fetch: ${req.options?.method || 'GET'} ${redactUrlForLog(req.url)}`);

                let respJSON = '';
                const fetchOpts = {};
                if (req.options) {
                    if (req.options.method) fetchOpts.method = req.options.method;
                    if (req.options.headers) fetchOpts.headers = req.options.headers;
                    if (Object.prototype.hasOwnProperty.call(req.options, 'body')) {
                        fetchOpts.body = req.options.body;
                    }
                }

                let useProxy = false;
                if (self.hostFetchProxy && req.url) {
                    try {
                        const target = new URL(req.url);
                        useProxy = target.origin !== self.location.origin;
                    } catch (_e) {
                        useProxy = false;
                    }
                }

                if (useProxy) {
                    const proxyResp = await fetch(self.hostFetchProxy, {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ url: req.url, options: fetchOpts }),
                    });
                    respJSON = await proxyResp.text();
                } else {
                    const resp = await fetch(req.url, fetchOpts);
                    const body = await resp.text();
                    const respHeaders = {};
                    resp.headers.forEach((v, k) => { respHeaders[k] = v; });
                    respJSON = JSON.stringify({
                        status: resp.status,
                        statusText: resp.statusText,
                        headers: respHeaders,
                        body: body,
                    });
                }

                const respBytes = encoder.encode(respJSON);
                const ptr = emModule._malloc(respBytes.length) >>> 0;
                emModule.HEAPU8.set(respBytes, ptr);
                friscy_set_fetch_response(ptr, respBytes.length);
                emModule._free(ptr);
            } catch (e) {
                console.error('[worker] host-fetch error:', e.message);
                const errResp = JSON.stringify({
                    status: 0,
                    statusText: e.message,
                    headers: {},
                    body: '',
                });
                const errBytes = encoder.encode(errResp);
                const ptr = emModule._malloc(errBytes.length) >>> 0;
                emModule.HEAPU8.set(errBytes, ptr);
                friscy_set_fetch_response(ptr, errBytes.length);
                emModule._free(ptr);
            }
        }

        // Phase 2: wait-for-child yield — the parent called wait4() and the
        // child is still Running. In our single-worker vfork model the child
        // already ran to completion before the parent resumed, so by the time
        // we see STOP_REASON_WAIT_CHILD the child should already be exited in
        // the process table. Drain events, then notify the C++ side so the
        // rewound wait4 ecall re-executes and finds the Exited child.
        if (stopReason & STOP_REASON_WAIT_CHILD) {
            drainProcessEvents();
            const friscy_notify_child_exit = emModule._friscy_notify_child_exit;
            if (typeof friscy_notify_child_exit === 'function') {
                // Extract blocked pid from WaitBlocked event, then find its
                // exit status from the Exit event in the same drain batch.
                let blockedPid = 0;
                let exitStatus = 0;
                if (self._lastProcessEvents) {
                    for (const ev of self._lastProcessEvents) {
                        if (ev.kind === PROCESS_EVENT_KIND_WAIT_BLOCKED) {
                            blockedPid = ev.pid;
                        }
                        if (ev.kind === PROCESS_EVENT_KIND_EXIT && ev.pid === blockedPid) {
                            exitStatus = ev.status;
                        }
                    }
                }
                if (blockedPid > 0) {
                    friscy_notify_child_exit(blockedPid, exitStatus);
                } else {
                    // Fallback: clear wait state unconditionally
                    friscy_notify_child_exit(0, 0);
                }
                console.log(`[worker] wait-child: unblocked pid=${blockedPid} status=${exitStatus}`);
            }
        }

        if (jitManager.jitCompiler && !suppressJitDispatch) {
            let pc = friscy_get_pc() >>> 0;
            const statePtr = friscy_get_state_ptr();
            const MAX_CHAIN = 32;
            let chainCount = 0;

            while (chainCount < MAX_CHAIN) {
                telemetry.jitDispatches++;
                const jitResult = jitManager.execute(pc, statePtr);
                if (!jitResult) {
                    telemetry.jitFallbacks++;
                    jitManager.recordExecution(pc);
                    friscy_set_pc(pc);
                    break;
                }

                if (jitResult.isHalt) {
                    telemetry.jitHalts++;
                    flushTelemetry('jit_halt');
                    return 'jit_halt';
                }

                if (jitResult.isSyscall) {
                    telemetry.jitSyscalls++;
                    friscy_set_pc(jitResult.nextPC >>> 0);
                    break;
                }

                if (jitResult.regionMiss) {
                    telemetry.jitRegionMisses++;
                    jitManager.recordTraceTransition(pc, jitResult.nextPC >>> 0);
                    pc = jitResult.nextPC >>> 0;
                    chainCount++;
                    continue;
                }

                telemetry.jitDirectRuns++;
                friscy_set_pc(jitResult.nextPC >>> 0);
                break;
            }

            if (chainCount >= MAX_CHAIN) {
                friscy_set_pc(pc >>> 0);
            }
        }

        resumeCount++;
        if (resumeCount <= 5 || resumeCount % 100 === 0) {
            console.log(`[worker] resume #${resumeCount}`);
        }
        if (rawStopReason & STOP_REASON_TIMESLICE) telemetry.timesliceResumeAttempts++;
        let stillStopped;
        // Protection faults from stale execute segments may escape WASM
        // exception handling (tail-call dispatch prevents C++ catch from
        // firing). Retry with segment eviction up to 8 times.
        let faultRetries = 0;
        while (true) {
            try {
                stillStopped = await friscy_resume();
                consecutiveResumeThrows = 0;
                break;
            } catch (resumeErr) {
                telemetry.resumeThrows++;
                const resumeErrShown = String(resumeErr?.message || resumeErr || '');
                console.error('[worker] friscy_resume threw:', resumeErrShown);
                if (stopReason & STOP_REASON_STDIN) {
                    telemetry.recoveredThrows++;
                    stillStopped = 1;
                    break;
                }
                const resumeErrText = String(resumeErr);
                const resumeErrMsg = (resumeErr && typeof resumeErr === 'object' && 'message' in resumeErr)
                    ? String(resumeErr.message)
                    : '';
                const escapedArrayThrow =
                    Array.isArray(resumeErr) ||
                    resumeErrShown.includes('[array Array]') ||
                    resumeErrText.includes('[array Array]') ||
                    resumeErrMsg.includes('[array Array]');
                if (escapedArrayThrow) {
                    // JSPI/Wasm exception payloads can surface as raw JS arrays.
                    // Treat them as transient stop boundaries instead of hard faults.
                    telemetry.recoveredThrows++;
                    console.warn(
                        `[worker] recoverable escaped resume throw shown=${JSON.stringify(resumeErrShown)} text=${JSON.stringify(resumeErrText)} msg=${JSON.stringify(resumeErrMsg)} ctor=${JSON.stringify(resumeErr?.constructor?.name || '')}`
                    );
                    const recoverFns = [
                        emModule._friscy_evict_execute_segments,
                        emModule._friscy_recover_fault,
                    ];
                    for (const fn of recoverFns) {
                        if (typeof fn !== 'function') continue;
                        try { fn(); } catch (_) {}
                    }
                    stillStopped = 1;
                    break;
                }
                // Some resume throws are non-fatal in JSPI mode. If the VM is
                // already stopped with a concrete stop-reason, continue loop.
                const stoppedNow = !!(friscy_stopped && friscy_stopped());
                const reasonNow = getStopReason(friscy_stop_reason, friscy_stopped);
                if (stoppedNow && reasonNow !== STOP_REASON_NONE) {
                    telemetry.recoveredThrows++;
                    stillStopped = 1;
                    break;
                }
                consecutiveResumeThrows++;
                if (consecutiveResumeThrows >= 3) {
                    suppressJitDispatch = true;
                    telemetry.jitSuppressedByFaults++;
                }
                if (faultRetries++ >= 8) {
                    flushTelemetry('too_many_faults');
                    return 'too_many_faults';
                }
                if (typeof emModule._friscy_recover_fault === 'function') {
                    try { emModule._friscy_recover_fault(); } catch (_) {}
                    await new Promise((r) => setTimeout(r, 0));
                    continue;
                }
                flushTelemetry('resume_exception');
                return 'resume_exception';
            }
        }
        maybePostJitStats();
        if (!stillStopped) {
            flushTelemetry('finished_after_resume');
            console.log(`[worker] resume loop: machine finished after ${resumeCount} resumes`);
            return 'finished_after_resume';
        }
    }

    flushTelemetry('control_sab_missing');
    return 'control_sab_missing';
}

self.addEventListener('error', (e) => {
    console.error('[worker] Uncaught error:', e.message, e.filename, e.lineno);
    self.postMessage({ type: 'error', message: `${e.message} (${e.filename}:${e.lineno})` });
});
self.addEventListener('unhandledrejection', (e) => {
    console.error('[worker] Unhandled rejection:', e.reason);
    self.postMessage({ type: 'error', message: String(e.reason) });
});

self.onmessage = async function(e) {
    const msg = e.data;

    if (msg.type === 'init') {
        try {
        const controlSab = msg.controlSab;
        const stdoutSab = msg.stdoutSab;
        const netSab = msg.netSab;
        const enableJit = msg.enableJit !== false;
        const jitHotThreshold = Number.isFinite(msg.jitHotThreshold) ? msg.jitHotThreshold : null;
        const jitTierEnabled = msg.jitTierEnabled !== false;
        const jitOptimizeThreshold = Number.isFinite(msg.jitOptimizeThreshold) ? msg.jitOptimizeThreshold : null;
        const jitSchedulerBudget = Number.isFinite(msg.jitSchedulerBudget) ? msg.jitSchedulerBudget : null;
        const jitSchedulerConcurrency = Number.isFinite(msg.jitSchedulerConcurrency)
            ? msg.jitSchedulerConcurrency
            : null;
        const jitSchedulerQueueMax = Number.isFinite(msg.jitSchedulerQueueMax)
            ? msg.jitSchedulerQueueMax
            : null;
        const jitPredictTopK = Number.isFinite(msg.jitPredictTopK) ? msg.jitPredictTopK : null;
        const jitPredictConfidence = Number.isFinite(msg.jitPredictConfidence) ? msg.jitPredictConfidence : null;
        const jitMarkovEnabled = msg.jitMarkovEnabled !== false;
        const jitTripletEnabled = msg.jitTripletEnabled !== false;
        const jitAwaitCompiler = msg.jitAwaitCompiler === true;
        jitPrewarmEnabled = msg.jitPrewarmEnabled !== false;
        const jitTraceEnabled = msg.jitTraceEnabled !== false;
        const jitEdgeHotThreshold = Number.isFinite(msg.jitEdgeHotThreshold) ? msg.jitEdgeHotThreshold : null;
        const jitTraceTripletHotThreshold = Number.isFinite(msg.jitTraceTripletHotThreshold)
            ? msg.jitTraceTripletHotThreshold
            : null;
        timesliceResumeEnabled = msg.timesliceResumeEnabled !== false;
        self.allowNetwork = msg.allowNetwork === true;
        self.hostFetchProxy = (typeof msg.hostFetchProxy === 'string' && msg.hostFetchProxy)
            ? msg.hostFetchProxy
            : '';

        controlView = new Int32Array(controlSab);
        controlBytes = new Uint8Array(controlSab);
        stdoutView = new Int32Array(stdoutSab);
        stdoutBytes = new Uint8Array(stdoutSab);

        if (netSab) {
            netView = new Int32Array(netSab);
            netBytes = new Uint8Array(netSab);
        }

        const initCols = Atomics.load(controlView, 6);
        const initRows = Atomics.load(controlView, 7);

        if (!self.crossOriginIsolated) {
            throw new Error('Worker not cross-origin isolated');
        }

        console.log('[worker] Loading Emscripten module...');
        const { default: createFriscy } = await import('./friscy.js');
        const stdinBuffer = [];

        emModule = await createFriscy({
            noInitialRun: true,
            print: function(text) {
                console.log('[friscy]', text);
                writeStdoutRing(encoder.encode(text + '\n'));
                drainProcessEvents();
            },
            printErr: function(text) {
                console.error('[friscy-err]', text);
                drainProcessEvents();
            },
            _termWrite: function(text) {
                writeStdoutRing(encoder.encode(text));
                drainProcessEvents();
            },
            _friscyEmitProcessEvent: function(kind, pid, ppid, pgid, status) {
                processEventsDirectPathSeen = true;
                const k = kind | 0;
                const event = {
                    kind: k,
                    kindName: (k === PROCESS_EVENT_KIND_SPAWN)
                        ? 'spawn'
                        : (k === PROCESS_EVENT_KIND_EXIT)
                            ? 'exit'
                            : (k === PROCESS_EVENT_KIND_WAIT_WAKEUP)
                                ? 'wait_wakeup'
                                : 'unknown',
                    pid: pid | 0,
                    ppid: ppid | 0,
                    pgid: pgid | 0,
                    status: status | 0,
                };
                if (event.kind === PROCESS_EVENT_KIND_EXIT) {
                    lastProcessExitStatus = event.status | 0;
                } else if (event.kind === PROCESS_EVENT_KIND_WAIT_WAKEUP) {
                    lastProcessWaitWakeStatus = event.status | 0;
                }
                self.postMessage({ type: 'process-events', events: [event] });
            },
            _decoder: new TextDecoder(),
            _stdinBuffer: stdinBuffer,
            _stdinEOF: false,
            _termRows: initRows || 24,
            _termCols: initCols || 80,
            stdin: function() {
                if (stdinBuffer.length > 0) {
                    return stdinBuffer.shift();
                }
                const data = requestStdin(1);
                return data.length > 0 ? data[0] : null;
            },
            onExit: function(code) {
                signalExit(code);
            },
            onAbort: function(reason) {
                console.error('[worker] Module abort reason:', reason);
            },
        });

        if (enableJit) {
            try {
                const jitMod = await import('./jit_manager.js');
                jitManager = jitMod.default;
                installInvalidationHook = jitMod.installInvalidationHook;
                if (jitHotThreshold !== null && jitHotThreshold > 0) {
                    jitManager.hotThreshold = jitHotThreshold;
                }
                jitManager.configureTiering({
                    enabled: jitTierEnabled,
                    optimizeThreshold: jitOptimizeThreshold,
                });
                jitManager.configureScheduler({
                    compileBudgetPerSecond: jitSchedulerBudget,
                    maxConcurrentCompiles: jitSchedulerConcurrency,
                    compileQueueMax: jitSchedulerQueueMax,
                    predictorTopK: jitPredictTopK,
                    predictorBaseConfidenceThreshold: jitPredictConfidence,
                });
                jitManager.configurePredictor({
                    markovEnabled: jitMarkovEnabled,
                    tripletEnabled: jitTripletEnabled,
                });
                jitManager.configureTrace({
                    enabled: jitTraceEnabled,
                    edgeHotThreshold: jitEdgeHotThreshold,
                    tripletHotThreshold: jitTraceTripletHotThreshold,
                });
            } catch (e) {
                console.warn('[worker] JIT manager not available:', e.message);
            }

            if (typeof installInvalidationHook === 'function') installInvalidationHook(emModule);

            const wasmMemory = emModule.wasmMemory || (emModule.asm && emModule.asm.memory);
            if (wasmMemory) {
                jitManager.init(wasmMemory);
                const warmCompiler = async () => {
                    await jitManager.loadCompiler('rv2wasm_jit_bg.wasm');
                    if (!jitPrewarmEnabled || !jitManager.jitCompiler || typeof jitManager.prewarmCompiler !== 'function') {
                        return;
                    }
                    await jitManager.prewarmCompiler();
                };
                if (jitAwaitCompiler) {
                    try {
                        await warmCompiler();
                    } catch (e) {
                        console.warn('[worker] JIT compiler wait failed:', e.message);
                    }
                } else {
                    warmCompiler().catch(e => {
                        console.warn('[worker] JIT compiler not available:', e.message);
                    });
                }
            }
        }

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
                if (result > 0) {
                    console.log(`[worker][socket-api] hasSocketData fd=${fd} ready=1`);
                }
                return result > 0;
            };
            emModule.readSocketData = function(fd, maxLen) {
                const resp = networkRPC(NET_OP_RECV, fd, maxLen, 0, null);
                if (resp.result > 0 && resp.data) {
                    console.log(`[worker][socket-api] readSocketData fd=${fd} bytes=${resp.result}`);
                    return Array.from(resp.data);
                }
                if (resp.result === 0) {
                    console.log(`[worker][socket-api] readSocketData fd=${fd} eof`);
                    return [];
                }
                return null;
            };
            emModule.hasPendingAccept = function(fd) {
                const { result } = networkRPC(NET_OP_HAS_PENDING_ACCEPT, fd, 0, 0, null);
                return result > 0;
            };
        }

        self.postMessage({ type: 'ready' });
        } catch (e) {
            console.error('[worker] Init failed:', e.message, e.stack);
            self.postMessage({ type: 'error', message: e.message, stack: e.stack });
        }
    }

    if (msg.type === 'net_proxy') {
        console.log('[worker] Initializing WebTransport proxy lane to:', msg.proxyUrl);
        netWorker = new Worker('./net_lane_worker.js', { type: 'module' });
        netWorker.onerror = (err) => {
            console.error('[worker] net lane worker error:', err?.message || err);
            netWorker = null;
        };
        
        netWorker.onmessage = (e) => {
            const laneMsg = e.data;
            if (laneMsg.type === 'ready') {
                console.log('[worker] net lane ready');
                return;
            }
            if (laneMsg.type === 'error') {
                console.error('[worker] net lane init failed:', laneMsg.message || 'unknown');
                netWorker = null;
                return;
            }
            if (laneMsg.type === 'rpc_result') {
                if (!netView) return;
                Atomics.store(netView, 5, laneMsg.result);
                
                if (laneMsg.data && laneMsg.data.byteLength > 0) {
                    const u8 = new Uint8Array(laneMsg.data);
                    const len = Math.min(u8.length, NET_DATA_SIZE);
                    Atomics.store(netView, 6, len);
                    netBytes.set(u8.subarray(0, len), NET_HEADER);
                } else {
                    Atomics.store(netView, 6, 0);
                }
                
                Atomics.store(netView, 0, 2);
                Atomics.notify(netView, 0);
            }
        };
        
        netWorker.postMessage({
            type: 'init',
            proxyUrl: msg.proxyUrl,
            certHash: msg.certHash
        });
    }

    if (msg.type === 'run') {
        const args = msg.args || [];
        try {
            lastProcessExitStatus = null;
            lastProcessWaitWakeStatus = null;
            if (typeof emModule?._friscy_clear_last_fault === 'function') {
                emModule._friscy_clear_last_fault();
            }
            if (msg.rootfsData) {
                emModule.FS.writeFile('/rootfs.tar', new Uint8Array(msg.rootfsData));
            }

            if (msg.checkpointData) {
                emModule.FS.writeFile('/checkpoint.ckpt', new Uint8Array(msg.checkpointData));
                args.unshift('--load-checkpoint', '/checkpoint.ckpt');
                console.log('[worker] Checkpoint loaded (' + msg.checkpointData.byteLength + ' bytes)');
            }

            await emModule.callMain(args);
            // Drain any process lifecycle events produced during normal run completion.
            drainProcessEvents();
            if (emModule._friscy_stopped && emModule._friscy_stopped()) {
                if (jitPrewarmEnabled && jitManager.jitCompiler && typeof jitManager.prewarmRegionAt === 'function') {
                    try {
                        const pc = (typeof emModule._friscy_get_pc === 'function') ? (emModule._friscy_get_pc() >>> 0) : 0;
                        const ok = await jitManager.prewarmRegionAt(pc);
                        if (ok) console.log(`[worker] JIT region prewarmed at 0x${pc.toString(16)}`);
                        else console.log(`[worker] JIT region prewarm skipped at 0x${pc.toString(16)}`);
                    } catch (e) {
                        console.warn('[worker] JIT region prewarm failed:', e.message);
                    }
                }
                await runResumeLoop();
                drainProcessEvents();
            }
            maybePostJitStats(true);
            signalExit(0);
        } catch (e) {
            const errMsg = e?.message || String(e);
            const errText = String(errMsg);
            const errStack = e?.stack ? `\n${e.stack}` : '';

            // Protection faults may escape C++ try/catch in WASM tail-call mode.
            // Try to recover by evicting stale execute segments before classifying.
            const isBadAlloc = errText.includes('bad_alloc');
            const recoverableRunFault =
                errText.includes('Protection fault') ||
                errText.includes('MachineException') ||
                isBadAlloc
            ;
            const recoverFn = isBadAlloc
                ? emModule._friscy_evict_execute_segments
                : emModule._friscy_recover_fault;
            console.log(`[worker] recoverableRunFault=${recoverableRunFault} isBadAlloc=${isBadAlloc} recoverFnType=${typeof recoverFn} err=${errText}`);
            if (recoverableRunFault && typeof recoverFn === 'function') {
                try {
                    logRuntimeState(`[worker] pre-recover escaped callMain fault (${errMsg})`);
                    const recovered = recoverFn();
                    console.log(`[worker] recover attempt for escaped callMain failure (${errMsg}) => ${recovered}`);
                    if (recovered) {
                        logRuntimeState(`[worker] post-recover escaped callMain fault (${errMsg})`);
                        console.log(`[worker] recovered from escaped callMain failure (${errMsg}), forcing resume`);
                        drainProcessEvents();
                        const recoveredGracefully = await resumeEscapedRunFault(errMsg);
                        if (recoveredGracefully) {
                            maybePostJitStats(true);
                            signalExit(0);
                            return;
                        }
                    }
                } catch (recoverErr) {
                    console.warn(`[worker] recovery hook threw after callMain failure (${errMsg}):`, recoverErr?.message || recoverErr);
                }
            }

            const cls = classifyRunFailure(e);
            if (cls.graceful) {
                const diag = JSON.stringify(cls.diagnostics);
                console.warn(`[worker] callMain threw after graceful completion, suppressing error: ${diag}`);
                drainProcessEvents();
                // If the machine is stopped waiting for input, enter the
                // resume loop instead of exiting. Child process exits
                // (e.g. bash sourcing .bashrc) trigger graceful=true but
                // the parent shell still needs to continue.
                if (cls.diagnostics.stopped) {
                    console.log('[worker] Machine stopped after graceful throw — entering resume loop');
                    await runResumeLoop();
                    drainProcessEvents();
                }
                maybePostJitStats(true);
                signalExit(0);
                return;
            }
            const diag = JSON.stringify(cls.diagnostics);
            console.error(`[worker] Run failed: ${errMsg} ${diag}`, e?.stack || '');
            writeStdoutRing(encoder.encode(`\r\n[worker] Error: ${errMsg}${errStack}\r\n`));
            maybePostJitStats(true);
            signalExit(1);
        }
    }

    if (msg.type === 'activate-vh-stage2') {
        if (!emModule) {
            self.postMessage({ type: 'vh-stage2-error', message: 'Module not initialized' });
            return;
        }
        try {
            if (typeof emModule._friscy_activate_vh_stage2 !== 'function') {
                throw new Error('friscy_activate_vh_stage2 export missing');
            }
            const rc = emModule._friscy_activate_vh_stage2();
            if (rc !== 0) {
                throw new Error(`friscy_activate_vh_stage2 failed rc=${rc}`);
            }
            self.postMessage({ type: 'vh-stage2-activated' });
        } catch (e) {
            console.error('[worker] VH stage2 activation failed:', e.message, e.stack);
            self.postMessage({ type: 'vh-stage2-error', message: e.message, stack: e.stack });
        }
    }

    if (msg.type === 'resize') {
        if (emModule) {
            emModule._termRows = msg.rows || 24;
            emModule._termCols = msg.cols || 80;
        }
    }

    if (msg.type === 'write_file') {
        if (emModule && emModule.FS) {
            try {
                emModule.FS.writeFile(msg.path, new Uint8Array(msg.data));
                console.log(`[worker] Wrote ${msg.data.byteLength} bytes to ${msg.path}`);
            } catch (e) {
                console.error(`[worker] Failed to write file ${msg.path}:`, e.message);
            }
        }
    }

    if (msg.type === 'load_overlay') {
        if (emModule && emModule.FS && msg.data) {
            try {
                emModule.FS.writeFile('/tmp/overlay.tar', new Uint8Array(msg.data));
                console.log(`[worker] Loaded overlay tar (${msg.data.byteLength} bytes)`);
            } catch (e) {
                console.error('[worker] Failed to load overlay:', e.message);
            }
        }
    }

    if (msg.type === 'export-checkpoint') {
        if (!emModule || !emModule.FS) {
            self.postMessage({ type: 'checkpoint-export-error', message: 'Module not initialized' });
            return;
        }
        try {
            const t0 = Date.now();
            if (msg.rootfsData) {
                emModule.FS.writeFile('/rootfs.tar', new Uint8Array(msg.rootfsData));
            }
            const args = [
                '--rootfs', '/rootfs.tar',
                '--env', 'LD_PRELOAD=/usr/lib/vh_preload.so',
                '--env', 'ANTHROPIC_API_KEY=sk-ant-dummy',
                '--export-checkpoint', '/export.ckpt',
                '/usr/bin/node', '--jitless', '--max-old-space-size=256', '/usr/local/bin/claude-repl.js',
            ];
            console.log('[worker] Export checkpoint started (LD_PRELOAD, ~20–30 min)...');
            self.postMessage({ type: 'checkpoint-export-stage', stage: 'boot-started', atMs: Date.now() - t0 });
            await emModule.callMain(args);
            const stopped = emModule._friscy_stopped ? !!emModule._friscy_stopped() : false;
            self.postMessage({
                type: 'checkpoint-export-stage',
                stage: 'stdin-wait-reached',
                atMs: Date.now() - t0,
                stopped,
            });
            let copy;
            if (emModule._friscy_export_checkpoint) {
                const sizePtr = emModule._malloc(4);
                const dataPtr = emModule._friscy_export_checkpoint(sizePtr);
                const size = Number(emModule.HEAPU32[Number(sizePtr) >> 2]);
                emModule._free(sizePtr);
                if (dataPtr && size > 0) {
                    const ptr = Number(dataPtr);
                    copy = new Uint8Array(emModule.HEAPU8.buffer, ptr, size).slice();
                    emModule._free(dataPtr);
                }
            }
            if (!copy) {
                const data = emModule.FS.readFile('/export.ckpt');
                copy = new Uint8Array(data.length);
                copy.set(data);
            }
            console.log('[worker] Checkpoint exported:', copy.length, 'bytes');
            self.postMessage({
                type: 'checkpoint-exported',
                data: copy,
                metrics: {
                    totalMs: Date.now() - t0,
                    bytes: copy.length,
                    stopped,
                },
            }, [copy.buffer]);
        } catch (e) {
            console.error('[worker] Export failed:', e.message, e.stack);
            self.postMessage({ type: 'checkpoint-export-error', message: e.message, stack: e.stack });
        }
    }

    if (msg.type === 'export-checkpoint-live') {
        if (!emModule) {
            self.postMessage({ type: 'checkpoint-export-error', message: 'Module not initialized' });
            return;
        }
        try {
            const copy = exportLiveCheckpointBytes();
            self.postMessage({
                type: 'checkpoint-exported-live',
                data: copy,
                metrics: { bytes: copy.length },
            }, [copy.buffer]);
        } catch (e) {
            console.error('[worker] Live export failed:', e.message, e.stack);
            self.postMessage({ type: 'checkpoint-export-error', message: e.message, stack: e.stack });
        }
    }
};
