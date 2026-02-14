// network_rpc_host.js - Main-thread network RPC handler for worker bridge
//
// Polls the network SharedArrayBuffer for RPC requests from the worker,
// dispatches them to the FriscyNetworkBridge (WebTransport), and writes
// results back. The worker blocks on Atomics.wait() until each RPC completes.
//
// Usage:
//   import { NetworkRPCHost } from './network_rpc_host.js';
//   const host = new NetworkRPCHost(netSab, bridge);
//   host.start();

// Network RPC operation codes (must match worker.js)
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

const NET_HEADER = 64;
const NET_DATA_SIZE = 65472;

/**
 * Main-thread handler for network RPC requests from the worker.
 */
export class NetworkRPCHost {
    /**
     * @param {SharedArrayBuffer} netSab - 64KB SAB shared with worker
     * @param {FriscyNetworkBridge} bridge - WebTransport network bridge
     */
    constructor(netSab, bridge) {
        this.netView = new Int32Array(netSab);
        this.netBytes = new Uint8Array(netSab);
        this.bridge = bridge;
        this.running = false;
        this._pollTimer = null;
    }

    /**
     * Start polling for RPC requests from the worker.
     */
    start() {
        if (this.running) return;
        this.running = true;
        this._poll();
    }

    /**
     * Stop polling.
     */
    stop() {
        this.running = false;
        if (this._pollTimer) {
            clearTimeout(this._pollTimer);
            this._pollTimer = null;
        }
    }

    /**
     * Poll loop: check if worker has posted an RPC request.
     * Uses setTimeout(0) for ~4ms polling latency.
     */
    _poll() {
        if (!this.running) return;

        const lock = Atomics.load(this.netView, 0);
        if (lock === 1) {
            // RPC request pending — process it
            this._handleRPC();
        }

        this._pollTimer = setTimeout(() => this._poll(), 0);
    }

    /**
     * Handle a single RPC request from the worker.
     */
    _handleRPC() {
        const op = Atomics.load(this.netView, 1);
        const fd = Atomics.load(this.netView, 2);
        const arg1 = Atomics.load(this.netView, 3);
        const arg2 = Atomics.load(this.netView, 4);
        const dataLen = Atomics.load(this.netView, 6);

        let reqData = null;
        if (dataLen > 0) {
            reqData = new Uint8Array(dataLen);
            for (let i = 0; i < dataLen; i++) {
                reqData[i] = this.netBytes[NET_HEADER + i];
            }
        }

        let result = 0;
        let respData = null;

        try {
            switch (op) {
                case NET_OP_SOCKET_CREATE: {
                    // arg1 = domain, arg2 = type
                    // Register the socket directly with the bridge
                    const connID = this.bridge.nextConnID++;
                    this.bridge.fdToConnID.set(fd, connID);
                    this.bridge.connections.set(connID, {
                        id: connID,
                        fd,
                        domain: arg1,
                        type: arg2,
                        connected: false,
                        isListener: false,
                        recvBuffer: [],
                    });
                    result = 0;
                    break;
                }

                case NET_OP_CONNECT:
                    result = this.bridge.handleConnect(fd, reqData);
                    break;

                case NET_OP_BIND:
                    result = this.bridge.handleBind(fd, reqData);
                    break;

                case NET_OP_LISTEN:
                    result = this.bridge.handleListen(fd, arg1);
                    break;

                case NET_OP_ACCEPT: {
                    const accepted = this.bridge.handleAccept(fd);
                    if (typeof accepted === 'number') {
                        result = accepted; // Error code (e.g. -11 EAGAIN)
                    } else {
                        result = accepted.fd;
                        if (accepted.addr) {
                            const enc = new TextEncoder();
                            respData = enc.encode(accepted.addr);
                        }
                    }
                    break;
                }

                case NET_OP_SEND:
                    result = this.bridge.handleSend(fd, reqData);
                    break;

                case NET_OP_RECV: {
                    // arg1 = maxLen
                    const connID = this.bridge.fdToConnID.get(fd);
                    const conn = this.bridge.connections.get(connID);
                    if (!conn || conn.recvBuffer.length === 0) {
                        result = 0; // No data available
                    } else {
                        const len = Math.min(arg1, conn.recvBuffer.length);
                        respData = new Uint8Array(conn.recvBuffer.splice(0, len));
                        result = len;
                    }
                    break;
                }

                case NET_OP_CLOSE:
                    result = this.bridge.handleClose(fd);
                    break;

                case NET_OP_HAS_DATA: {
                    const connID = this.bridge.fdToConnID.get(fd);
                    const conn = this.bridge.connections.get(connID);
                    result = (conn && conn.recvBuffer.length > 0) ? 1 : 0;
                    break;
                }

                case NET_OP_HAS_PENDING_ACCEPT: {
                    const connID = this.bridge.fdToConnID.get(fd);
                    const queue = this.bridge.acceptQueues.get(connID);
                    result = (queue && queue.length > 0) ? 1 : 0;
                    break;
                }

                case NET_OP_SHUTDOWN:
                    result = this.bridge.handleClose(fd);
                    break;

                case NET_OP_SETSOCKOPT:
                case NET_OP_GETSOCKOPT:
                    result = 0; // Stub: success
                    break;

                default:
                    result = -38; // ENOSYS
            }
        } catch (e) {
            console.error('[net-rpc] Error handling op', op, ':', e);
            result = -5; // EIO
        }

        // Write response
        Atomics.store(this.netView, 5, result);
        if (respData && respData.length > 0) {
            const len = Math.min(respData.length, NET_DATA_SIZE);
            Atomics.store(this.netView, 6, len);
            this.netBytes.set(respData.subarray(0, len), NET_HEADER);
        } else {
            Atomics.store(this.netView, 6, 0);
        }

        // Signal worker: response ready (lock = 2)
        Atomics.store(this.netView, 0, 2);
        Atomics.notify(this.netView, 0);
    }
}
