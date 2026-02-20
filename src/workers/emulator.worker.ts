// src/workers/emulator.worker.ts
/* global DedicatedWorkerGlobalScope, Transferable, RequestInit */
// @ts-ignore
import jitManager, { installInvalidationHook } from '../../friscy-bundle/jit_manager.js';
import { SabOffset, EmscriptenModule, WorkerMessage, MainThreadMessage } from '../types/emulator';

// Worker global scope typing
interface FriscyWorkerGlobalScope extends DedicatedWorkerGlobalScope {
    crossOriginIsolated: boolean;
}
const ctx = self as unknown as FriscyWorkerGlobalScope;

const CMD_IDLE = 0;
const CMD_STDIN_REQUEST = 2;
const CMD_STDIN_READY = 3;
const CMD_EXIT = 4;
const CMD_EXPORT_VFS = 8;

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
const NET_OP_SHUTDOWN = 13;

const RING_HEADER = 8;
const RING_SIZE = 65528;
const NET_HEADER = 64;
const NET_DATA_SIZE = 65472;

let controlView: Int32Array | null = null;
let controlBytes: Uint8Array | null = null;
let stdoutView: Int32Array | null = null;
let stdoutBytes: Uint8Array | null = null;
let netView: Int32Array | null = null;
let netBytes: Uint8Array | null = null;
let emModule: EmscriptenModule | null = null;
let hostDirectoryHandle: FileSystemDirectoryHandle | null = null;

const encoder = new TextEncoder();
let lastJitStatsPostMs = 0;
const JIT_STATS_POST_INTERVAL_MS = 250;

function sendToMain(msg: MainThreadMessage, transfer?: Transferable[]) {
    if (transfer) {
        ctx.postMessage(msg, transfer);
    } else {
        ctx.postMessage(msg);
    }
}

function writeStdoutRing(data: Uint8Array) {
    if (!stdoutView || !stdoutBytes) return;
    const writeHead = Atomics.load(stdoutView, 0);
    const readTail = Atomics.load(stdoutView, 1);
    const available = writeHead >= readTail ? RING_SIZE - (writeHead - readTail) - 1 : readTail - writeHead - 1;
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

function requestStdin(maxLen: number): Uint8Array {
    if (!controlView || !controlBytes) return new Uint8Array(0);
    Atomics.store(controlView, SabOffset.LENGTH, maxLen);
    Atomics.store(controlView, SabOffset.COMMAND, CMD_STDIN_REQUEST);
    Atomics.notify(controlView, SabOffset.COMMAND);
    while (true) {
        const cmd = Atomics.load(controlView, SabOffset.COMMAND);
        if (cmd === CMD_STDIN_READY) break;
        Atomics.wait(controlView, SabOffset.COMMAND, cmd, 100);
    }
    const len = Atomics.load(controlView, SabOffset.LENGTH);
    if (len <= 0) return new Uint8Array(0);
    const result = new Uint8Array(len);
    for (let i = 0; i < len; i++) result[i] = controlBytes[SabOffset.PAYLOAD * 4 + i];
    Atomics.store(controlView, SabOffset.COMMAND, CMD_IDLE);
    return result;
}

function networkRPC(op: number, fd: number, arg1: number, arg2: number, data: Uint8Array | null): { result: number, data: Uint8Array | null } {
    if (!netView || !netBytes) return { result: -38, data: null };
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
    Atomics.store(netView, 0, 1);
    Atomics.notify(netView, 0);
    while (true) {
        const lock = Atomics.load(netView, 0);
        if (lock === 2) break;
        Atomics.wait(netView, 0, lock, 100);
    }
    const result = Atomics.load(netView, 5);
    const respLen = Atomics.load(netView, 6);
    let respData: Uint8Array | null = null;
    if (respLen > 0) {
        respData = new Uint8Array(respLen);
        for (let i = 0; i < respLen; i++) respData[i] = netBytes[NET_HEADER + i];
    }
    Atomics.store(netView, 0, 0);
    return { result, data: respData };
}

function signalExit(exitCode: number) {
    if (!controlView) return;
    Atomics.store(controlView, SabOffset.EXIT_CODE, exitCode);
    Atomics.store(controlView, SabOffset.COMMAND, CMD_EXIT);
    Atomics.notify(controlView, SabOffset.COMMAND);
}

function maybePostJitStats(force = false) {
    if (!jitManager || typeof jitManager.getStats !== 'function') return;
    const now = Date.now();
    if (!force && now - lastJitStatsPostMs < JIT_STATS_POST_INTERVAL_MS) return;
    lastJitStatsPostMs = now;
    try {
        const stats = jitManager.getStats() as any;
        if (emModule) {
            // @ts-ignore
            if (emModule._friscy_instruction_counter) {
                // @ts-ignore
                stats.instructions = emModule._friscy_instruction_counter();
            } else if (emModule.HEAPU32) {
                // Fallback: try to find it in the global instance if we can't call it
            }
            stats.ramUsage = emModule.HEAPU8.buffer.byteLength;
        }
        if (stats) sendToMain({ type: 'jit_stats', stats, ts: now });
    } catch (_e) {}
}

async function exportVFS() {
    if (!emModule || !emModule._friscy_export_tar) return;
    console.log('[worker] Starting VFS export...');
    try {
        const sizePtr = emModule._malloc(4);
        const dataPtr = emModule._friscy_export_tar(sizePtr);
        const size = emModule.HEAPU32[sizePtr >> 2];
        emModule._free(sizePtr);
        if (dataPtr && size > 0) {
            const buffer = emModule.HEAPU8.slice(dataPtr, dataPtr + size).buffer;
            emModule._free(dataPtr);
            
            console.log(`[worker] VFS export size: ${size} bytes`);
            // Slice a copy for OPFS before transferring 'buffer'
            const tarCopy = new Uint8Array(buffer).slice(0);

            // 1. Send to main thread for snapshot callback
            sendToMain({ type: 'vfs_export', tarData: buffer }, [buffer]);

            // 2. Also save to OPFS for persistence
            const root = await navigator.storage.getDirectory();
            const fileHandle = await root.getFileHandle('persisted_rootfs.tar', { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(tarCopy);
            await writable.close();
            console.log('[worker] VFS export complete and persisted');
        } else {
            console.warn('[worker] VFS export returned empty data');
        }
    } catch (e: any) {
        console.error('[worker] VFS export failed:', e.message);
    }
}

async function saveToOPFS() {
    await exportVFS();
}

async function runResumeLoop() {
    if (!emModule) return;
    const friscy_stopped = emModule._friscy_stopped;
    const friscy_resume = emModule._friscy_resume;
    const friscy_get_pc = emModule._friscy_get_pc;
    const friscy_set_pc = emModule._friscy_set_pc;
    const friscy_get_state_ptr = emModule._friscy_get_state_ptr;
    const friscy_host_fetch_pending = emModule._friscy_host_fetch_pending;
    const friscy_get_fetch_request = emModule._friscy_get_fetch_request;
    const friscy_get_fetch_request_len = emModule._friscy_get_fetch_request_len;
    const friscy_set_fetch_response = emModule._friscy_set_fetch_response;

    let lastSaveTime = Date.now();

    while (friscy_stopped()) {
        if (!controlView || !controlBytes) break;
        const currentCmd = Atomics.load(controlView, SabOffset.COMMAND);
        
        if (currentCmd === CMD_EXPORT_VFS) {
            console.log('[worker] CMD_EXPORT_VFS detected in loop');
            Atomics.store(controlView, SabOffset.COMMAND, CMD_IDLE);
            await exportVFS();
        }

        // Periodic auto-save every 30 seconds
        if (Date.now() - lastSaveTime > 30000) {
            await exportVFS();
            lastSaveTime = Date.now();
        }

        const cmd = Atomics.load(controlView, SabOffset.COMMAND);
        if (cmd === CMD_STDIN_READY) {
            const len = Atomics.load(controlView, SabOffset.LENGTH);
            if (len > 0) {
                for (let i = 0; i < len; i++) emModule._stdinBuffer.push(controlBytes[SabOffset.PAYLOAD * 4 + i]);
            }
            Atomics.store(controlView, SabOffset.COMMAND, CMD_IDLE);
        } else {
            Atomics.store(controlView, SabOffset.LENGTH, 4096);
            Atomics.store(controlView, SabOffset.COMMAND, CMD_STDIN_REQUEST);
            Atomics.notify(controlView, SabOffset.COMMAND);
            Atomics.wait(controlView, SabOffset.COMMAND, CMD_STDIN_REQUEST, 100);
            const newCmd = Atomics.load(controlView, SabOffset.COMMAND);
            if (newCmd === CMD_STDIN_READY) {
                const len = Atomics.load(controlView, SabOffset.LENGTH);
                if (len > 0) {
                    for (let i = 0; i < len; i++) emModule._stdinBuffer.push(controlBytes[SabOffset.PAYLOAD * 4 + i]);
                }
                Atomics.store(controlView, SabOffset.COMMAND, CMD_IDLE);
            } else if (newCmd === CMD_STDIN_REQUEST) {
                // If it's still STDIN_REQUEST, it means we timed out or were woken by another change (like EXPORT_VFS)
                // Do NOT overwrite with IDLE if another command (like EXPORT_VFS) was written!
                // Actually, if it's STILL STDIN_REQUEST, we can set it back to IDLE to stop the main thread from providing data?
                // No, just leave it. If it was EXPORT_VFS, the loop will catch it.
            }
        }
        maybePostJitStats();

        if (friscy_host_fetch_pending && friscy_host_fetch_pending()) {
            try {
                const reqPtr = friscy_get_fetch_request();
                const reqLen = friscy_get_fetch_request_len();
                const reqBytes = new Uint8Array(emModule.HEAPU8.buffer, reqPtr, reqLen);
                const req = JSON.parse(new TextDecoder().decode(reqBytes.slice()));
                const fetchOpts: RequestInit = {};
                if (req.options) {
                    if (req.options.method) fetchOpts.method = req.options.method;
                    if (req.options.headers) fetchOpts.headers = req.options.headers;
                    if (req.options.body) fetchOpts.body = req.options.body;
                }
                const resp = await fetch(req.url, fetchOpts);
                const body = await resp.text();
                const respHeaders: Record<string, string> = {};
                resp.headers.forEach((v, k) => { respHeaders[k] = v; });
                const respJSON = JSON.stringify({ status: resp.status, statusText: resp.statusText, headers: respHeaders, body: body });
                const respBytes = encoder.encode(respJSON);
                const ptr = emModule._malloc(respBytes.length);
                emModule.HEAPU8.set(respBytes, ptr);
                friscy_set_fetch_response(ptr, respBytes.length);
                emModule._free(ptr);
            } catch (e: any) {
                const errResp = JSON.stringify({ status: 0, statusText: e.message, headers: {}, body: '' });
                const errBytes = encoder.encode(errResp);
                const ptr = emModule._malloc(errBytes.length);
                emModule.HEAPU8.set(errBytes, ptr);
                friscy_set_fetch_response(ptr, errBytes.length);
                emModule._free(ptr);
            }
        }

        if (jitManager.jitCompiler) {
            let pc = friscy_get_pc() >>> 0;
            const statePtr = friscy_get_state_ptr();
            const MAX_CHAIN = 32;
            let chainCount = 0;
            while (chainCount < MAX_CHAIN) {
                const jitResult = jitManager.execute(pc, statePtr);
                if (!jitResult) { jitManager.recordExecution(pc); friscy_set_pc(pc); break; }
                if (jitResult.isHalt) return;
                if (jitResult.isSyscall) { friscy_set_pc(jitResult.nextPC >>> 0); break; }
                if (jitResult.regionMiss) { jitManager.recordTraceTransition(pc, jitResult.nextPC >>> 0); pc = jitResult.nextPC >>> 0; chainCount++; continue; }
                friscy_set_pc(jitResult.nextPC >>> 0); break;
            }
            if (chainCount >= MAX_CHAIN) friscy_set_pc(pc >>> 0);
        }

        const stillStopped = await friscy_resume();
        maybePostJitStats();
        if (!stillStopped) return;
    }
}

ctx.onmessage = async (e: MessageEvent<WorkerMessage>) => {
    const msg = e.data;
    if (msg.type === 'init') {
        try {
            controlView = new Int32Array(msg.controlSab);
            controlBytes = new Uint8Array(msg.controlSab);
            stdoutView = new Int32Array(msg.stdoutSab);
            stdoutBytes = new Uint8Array(msg.stdoutSab);
            if (msg.netSab) {
                netView = new Int32Array(msg.netSab);
                netBytes = new Uint8Array(msg.netSab);
            }
            const initCols = Atomics.load(controlView, SabOffset.COLS);
            const initRows = Atomics.load(controlView, SabOffset.ROWS);
            if (!ctx.crossOriginIsolated) throw new Error('Worker not cross-origin isolated');
            
            // @ts-ignore
            const createFriscy = (await import('../../friscy-bundle/friscy.js')).default;
            const stdinBuffer: number[] = [];
            emModule = await createFriscy({
                noInitialRun: true,
                print: (t: string) => { console.log('[friscy]', t); writeStdoutRing(encoder.encode(t + '\n')); },
                printErr: (t: string) => { console.error('[friscy-err]', t); },
                _termWrite: (t: string) => { writeStdoutRing(encoder.encode(t)); },
                _decoder: new TextDecoder(),
                _stdinBuffer: stdinBuffer,
                _stdinEOF: false,
                _termRows: initRows || 24,
                _termCols: initCols || 80,
                stdin: () => {
                    if (stdinBuffer.length > 0) return stdinBuffer.shift()!;
                    const data = requestStdin(1);
                    return data.length > 0 ? data[0] : null;
                },
                onExit: (c: number) => { signalExit(c); },
            });

            if (msg.enableJit && emModule) {
                if (msg.jitHotThreshold !== null) jitManager.hotThreshold = msg.jitHotThreshold;
                jitManager.configureTiering({ enabled: msg.jitTierEnabled, optimizeThreshold: msg.jitOptimizeThreshold });
                jitManager.configureScheduler({ 
                    compileBudgetPerSecond: msg.jitSchedulerBudget, 
                    maxConcurrentCompiles: msg.jitSchedulerConcurrency, 
                    compileQueueMax: msg.jitSchedulerQueueMax,
                    predictorTopK: msg.jitPredictTopK,
                    predictorBaseConfidenceThreshold: msg.jitPredictConfidence
                });
                jitManager.configurePredictor({ markovEnabled: msg.jitMarkovEnabled, tripletEnabled: msg.jitTripletEnabled });
                jitManager.configureTrace({ enabled: msg.jitTraceEnabled, edgeHotThreshold: msg.jitEdgeHotThreshold, tripletHotThreshold: msg.jitTraceTripletHotThreshold });
                
                installInvalidationHook(emModule);
                const wasmMemory = emModule.wasmMemory || (emModule.asm && emModule.asm.memory);
                if (wasmMemory) {
                    jitManager.init(wasmMemory);
                    await jitManager.loadCompiler('/friscy-bundle/rv2wasm_jit_bg.wasm');
                }
            }

            if (netView && emModule) {
                emModule.onSocketCreated = (fd: number, d: number, t: number) => { networkRPC(NET_OP_SOCKET_CREATE, fd, d, t, null); };
                emModule.onSocketConnect = (fd: number, a: Uint8Array) => { const { result } = networkRPC(NET_OP_CONNECT, fd, 0, 0, a); return result; };
                emModule.onSocketBind = (fd: number, a: Uint8Array) => { const { result } = networkRPC(NET_OP_BIND, fd, 0, 0, a); return result; };
                emModule.onSocketListen = (fd: number, b: number) => { const { result } = networkRPC(NET_OP_LISTEN, fd, b, 0, null); return result; };
                emModule.onSocketAccept = (fd: number) => { const resp = networkRPC(NET_OP_ACCEPT, fd, 0, 0, null); if (resp.result < 0) return resp.result; if (!resp.data) return -1; return { fd: resp.result, addr: resp.data }; };
                emModule.onSocketSend = (fd: number, d: Uint8Array) => { const { result } = networkRPC(NET_OP_SEND, fd, 0, 0, d); return result; };
                emModule.onSocketClosed = (fd: number) => { const { result } = networkRPC(NET_OP_CLOSE, fd, 0, 0, null); return result; };
                emModule.onSocketShutdown = (fd: number, h: number) => { networkRPC(NET_OP_SHUTDOWN, fd, h, 0, null); };
                emModule.hasSocketData = (fd: number) => { const { result } = networkRPC(NET_OP_HAS_DATA, fd, 0, 0, null); return result > 0; };
                emModule.readSocketData = (fd: number, m: number) => { const resp = networkRPC(NET_OP_RECV, fd, m, 0, null); if (resp.result <= 0 || !resp.data) return null; return Array.from(resp.data); };
                emModule.hasPendingAccept = (fd: number) => { const { result } = networkRPC(NET_OP_HAS_PENDING_ACCEPT, fd, 0, 0, null); return result > 0; };
            }
            sendToMain({ type: 'ready' });
        } catch (e: any) { sendToMain({ type: 'error', message: e.message, stack: e.stack }); }
    }

    if (msg.type === 'run' && emModule) {
        try {
            let rootfs = msg.rootfsData ? new Uint8Array(msg.rootfsData) : null;
            
            // Try to restore from OPFS first
            try {
                const root = await navigator.storage.getDirectory();
                const fileHandle = await root.getFileHandle('persisted_rootfs.tar');
                const file = await fileHandle.getFile();
                const buf = await file.arrayBuffer();
                rootfs = new Uint8Array(buf);
                console.log(`[worker] Restored VFS from OPFS (${rootfs.length} bytes)`);
            } catch (e) {
                // Not found or failed, use provided default
                console.log('[worker] No persisted VFS found in OPFS, using default');
            }

            if (rootfs) emModule.FS.writeFile('/rootfs.tar', rootfs);
            await emModule.callMain(msg.args || []);
            if (emModule._friscy_stopped && emModule._friscy_stopped()) await runResumeLoop();
            maybePostJitStats(true);
            signalExit(0);
        } catch (e: any) {
            const errMsg = e?.message || String(e);
            writeStdoutRing(encoder.encode(`\r\n[worker] Error: ${errMsg}\r\n`));
            maybePostJitStats(true);
            signalExit(1);
        }
    }

    if (msg.type === 'resize' && emModule) {
        emModule._termRows = msg.rows || 24; emModule._termCols = msg.cols || 80;
    }

    if (msg.type === 'write_file' && emModule) {
        try { emModule.FS.writeFile(msg.path, new Uint8Array(msg.data)); } catch (e: any) { console.error(`[worker] Failed to write file ${msg.path}:`, e.message); }
    }

    if (msg.type === 'load_overlay' && emModule) {
        try { emModule.FS.writeFile('/tmp/overlay.tar', new Uint8Array(msg.data)); } catch (e: any) { console.error('[worker] Failed to load overlay:', e.message); }
    }

    if (msg.type === 'mount_local' && emModule) {
        hostDirectoryHandle = msg.handle;
        (emModule as any).hostDirectoryHandle = hostDirectoryHandle;
        console.log('[worker] Local directory mounted to /mnt/host');
    }
};
