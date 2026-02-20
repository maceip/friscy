// network_rpc_host.js - Main-thread handler for network RPC via SharedArrayBuffer
//
// Bridges the worker's synchronous network calls to the main thread's
// asynchronous WebTransport connection.

const NET_HEADER = 64;

export class NetworkRPCHost {
    constructor(netSab, bridge) {
        this.netSab = netSab;
        this.bridge = bridge;
        this.netView = new Int32Array(netSab);
        this.netBytes = new Uint8Array(netSab);
        this.interval = null;
    }

    start() {
        if (this.interval) return;
        this.interval = setInterval(async () => {
            const lock = Atomics.load(this.netView, 0);
            if (lock !== 1) return; // Wait for lock=1 (request pending)

            const op = Atomics.load(this.netView, 1);
            const fd = Atomics.load(this.netView, 2);
            const arg1 = Atomics.load(this.netView, 3);
            const arg2 = Atomics.load(this.netView, 4);
            const dataLen = Atomics.load(this.netView, 6);

            let result = -38; // ENOSYS
            let respData = null;

            try {
                switch (op) {
                    case 1: // NET_OP_SOCKET_CREATE
                        result = await this.bridge.socketCreate(fd, arg1, arg2);
                        break;
                    case 2: // NET_OP_CONNECT
                        result = await this.bridge.socketConnect(fd, this.netBytes.subarray(NET_HEADER, NET_HEADER + dataLen));
                        break;
                    case 6: // NET_OP_SEND
                        result = await this.bridge.socketSend(fd, this.netBytes.subarray(NET_HEADER, NET_HEADER + dataLen));
                        break;
                    case 7: // NET_OP_RECV
                        respData = await this.bridge.socketRecv(fd, arg1);
                        result = respData ? respData.length : 0;
                        break;
                    case 8: // NET_OP_CLOSE
                        result = await this.bridge.socketClose(fd);
                        break;
                    case 9: // NET_OP_HAS_DATA
                        result = 0; // Simplified
                        break;
                }
            } catch (e) {
                console.error('[net-host] RPC failed:', e);
                result = -1;
            }

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

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }
}

// For backward compatibility
export function setupNetworkRPCHost(netSab, bridge) {
    const host = new NetworkRPCHost(netSab, bridge);
    host.start();
    return host;
}
