// network_rpc_host.js - Main-thread handler for network RPC via SharedArrayBuffer
//
// Bridges the worker's synchronous network calls to the main thread's
// asynchronous WebTransport connection.

const NET_HEADER = 64;

export class NetworkRPCHost {
    constructor(netSab, bridge, options = {}) {
        this.netSab = netSab;
        this.bridge = bridge;
        this.netView = new Int32Array(netSab);
        this.netBytes = new Uint8Array(netSab);
        this.interval = null;
        this.laneEnabled = options.laneEnabled === true;
        this.proxyUrl = options.proxyUrl || null;
        this.certHash = options.certHash || null;
        this.queueMax = Number.isInteger(options.queueMax) && options.queueMax > 0 ? options.queueMax : 128;
        this.faultAfterRpcCount = Number.isInteger(options.faultAfterRpcCount) && options.faultAfterRpcCount >= 0
            ? options.faultAfterRpcCount
            : null;
        this.laneWorker = null;
        this.laneReady = false;
        this.injectedFault = false;
        this.pending = new Map();
        this.nextReqId = 1;
        this.totalRequests = 0;
        this.metrics = {
            queueDepth: 0,
            queueDepthPeak: 0,
            rpcCount: 0,
            rpcErrors: 0,
            avgLatencyMs: 0,
            laneActive: false,
            fallbackCount: 0,
            backpressureDrops: 0,
            laneFaults: 0,
        };
    }

    start() {
        if (this.interval) return;
        if (this.laneEnabled) {
            this.startLaneWorker();
        }
        this.interval = setInterval(async () => {
            const lock = Atomics.load(this.netView, 0);
            if (lock !== 1) return; // Wait for lock=1 (request pending)

            const op = Atomics.load(this.netView, 1);
            const fd = Atomics.load(this.netView, 2);
            const arg1 = Atomics.load(this.netView, 3);
            const arg2 = Atomics.load(this.netView, 4);
            const dataLen = Atomics.load(this.netView, 6);
            this.totalRequests++;

            let result = -38; // ENOSYS
            let respData = null;
            const startedAt = performance.now();

            try {
                const payload = dataLen > 0 ? this.netBytes.slice(NET_HEADER, NET_HEADER + dataLen) : null;
                if (
                    this.laneReady &&
                    !this.injectedFault &&
                    this.faultAfterRpcCount !== null &&
                    this.totalRequests > this.faultAfterRpcCount
                ) {
                    this.injectedFault = true;
                    this.metrics.laneFaults++;
                    if (this.laneWorker) {
                        this.laneWorker.terminate();
                        this.laneWorker = null;
                    }
                    this.laneReady = false;
                    this.metrics.laneActive = false;
                }
                if (this.laneReady) {
                    if (this.pending.size >= this.queueMax) {
                        this.metrics.backpressureDrops++;
                        result = -11; // EAGAIN
                    } else {
                        const laneResp = await this.dispatchToLane(op, fd, arg1, arg2, payload);
                        result = laneResp.result;
                        respData = laneResp.data;
                    }
                } else {
                    this.metrics.fallbackCount++;
                    const directResp = await this.dispatchDirect(op, fd, arg1, arg2, payload);
                    result = directResp.result;
                    respData = directResp.data;
                }
            } catch (e) {
                console.error('[net-host] RPC failed:', e);
                result = -1;
                this.metrics.rpcErrors++;
            }
            this.recordLatency(performance.now() - startedAt);

            // Write response
            Atomics.store(this.netView, 5, result);
            if (respData) {
                this.netBytes.set(respData, NET_HEADER);
                Atomics.store(this.netView, 6, respData.length);
            } else {
                Atomics.store(this.netView, 6, 0);
            }

            // Release lock
            Atomics.store(this.netView, 0, 2); // lock=2 (response ready)
            Atomics.notify(this.netView, 0);
        }, 1); // 1ms polling for low-latency network
    }

    async dispatchDirect(op, fd, arg1, arg2, payload) {
        let result = -38;
        let respData = null;
        switch (op) {
            case 1: // NET_OP_SOCKET_CREATE
                result = await this.bridge.socketCreate(fd, arg1, arg2);
                break;
            case 2: // NET_OP_CONNECT
                result = await this.bridge.socketConnect(fd, payload || new Uint8Array(0));
                break;
            case 3: // NET_OP_BIND
                result = await this.bridge.socketBind(fd, payload || new Uint8Array(0));
                break;
            case 4: // NET_OP_LISTEN
                result = await this.bridge.socketListen(fd, arg1);
                break;
            case 5: { // NET_OP_ACCEPT
                const accepted = await this.bridge.socketAccept(fd);
                result = accepted?.result ?? -11;
                respData = accepted?.addr || null;
                break;
            }
            case 6: // NET_OP_SEND
                result = await this.bridge.socketSend(fd, payload || new Uint8Array(0));
                break;
            case 7: // NET_OP_RECV
                respData = await this.bridge.socketRecv(fd, arg1);
                result = respData ? respData.length : 0;
                break;
            case 8: // NET_OP_CLOSE
                result = await this.bridge.socketClose(fd);
                break;
            case 9: // NET_OP_HAS_DATA
                result = await this.bridge.socketHasData(fd);
                break;
            case 10: // NET_OP_HAS_PENDING_ACCEPT
                result = await this.bridge.socketHasPendingAccept(fd);
                break;
            case 13: // NET_OP_SHUTDOWN
                result = await this.bridge.socketShutdown(fd, arg1);
                break;
        }
        return { result, data: respData };
    }

    startLaneWorker() {
        try {
            this.laneWorker = new Worker('./net_lane_worker.js', { type: 'module' });
            this.laneWorker.onmessage = (e) => {
                const msg = e.data || {};
                if (msg.type === 'ready') {
                    this.laneReady = true;
                    this.metrics.laneActive = true;
                    return;
                }
                if (msg.type === 'error') {
                    console.warn('[net-host] net lane error:', msg.message);
                    return;
                }
                if (msg.type === 'rpc_result') {
                    const req = this.pending.get(msg.id);
                    if (!req) return;
                    this.pending.delete(msg.id);
                    this.updateQueueDepth();
                    req.resolve({ result: msg.result, data: msg.data ? new Uint8Array(msg.data) : null });
                }
            };
            this.laneWorker.onerror = (e) => {
                console.warn('[net-host] net lane worker failed:', e.message || 'unknown');
                this.laneReady = false;
                this.metrics.laneActive = false;
            };
            this.laneWorker.postMessage({
                type: 'init',
                proxyUrl: this.proxyUrl,
                certHash: this.certHash,
            });
        } catch (e) {
            console.warn('[net-host] net lane disabled:', e.message);
            this.laneReady = false;
            this.metrics.laneActive = false;
        }
    }

    dispatchToLane(op, fd, arg1, arg2, payload) {
        return new Promise((resolve, reject) => {
            if (!this.laneWorker || !this.laneReady) {
                reject(new Error('net lane unavailable'));
                return;
            }
            const id = this.nextReqId++;
            this.pending.set(id, { resolve, reject });
            this.updateQueueDepth();
            this.laneWorker.postMessage({
                type: 'rpc',
                id,
                op,
                fd,
                arg1,
                arg2,
                data: payload ? payload.buffer : null,
            }, payload ? [payload.buffer] : []);
        });
    }

    updateQueueDepth() {
        this.metrics.queueDepth = this.pending.size;
        if (this.metrics.queueDepth > this.metrics.queueDepthPeak) {
            this.metrics.queueDepthPeak = this.metrics.queueDepth;
        }
    }

    recordLatency(latencyMs) {
        this.metrics.rpcCount++;
        const n = this.metrics.rpcCount;
        const prev = this.metrics.avgLatencyMs;
        this.metrics.avgLatencyMs = prev + (latencyMs - prev) / n;
    }

    getMetrics() {
        return { ...this.metrics };
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        if (this.laneWorker) {
            this.laneWorker.terminate();
            this.laneWorker = null;
        }
        this.laneReady = false;
        this.metrics.laneActive = false;
        this.pending.clear();
        this.updateQueueDepth();
    }
}

// For backward compatibility
export function setupNetworkRPCHost(netSab, bridge) {
    const host = new NetworkRPCHost(netSab, bridge);
    host.start();
    return host;
}
