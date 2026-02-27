import { FriscyNetworkBridge } from './network_bridge.js';

let bridge = null;

async function dispatch(op, fd, arg1, arg2, data) {
    let result = -38;
    let respData = null;
    switch (op) {
        case 1: // NET_OP_SOCKET_CREATE
            result = await bridge.socketCreate(fd, arg1, arg2);
            break;
        case 2: // NET_OP_CONNECT
            result = await bridge.socketConnect(fd, data || new Uint8Array(0));
            break;
        case 3: // NET_OP_BIND
            result = await bridge.socketBind(fd, data || new Uint8Array(0));
            break;
        case 4: // NET_OP_LISTEN
            result = await bridge.socketListen(fd, arg1);
            break;
        case 5: { // NET_OP_ACCEPT
            const accepted = await bridge.socketAccept(fd);
            result = accepted.result;
            respData = accepted.addr || null;
            break;
        }
        case 6: // NET_OP_SEND
            result = await bridge.socketSend(fd, data || new Uint8Array(0));
            break;
        case 7: // NET_OP_RECV
            respData = await bridge.socketRecv(fd, arg1);
            result = respData ? respData.length : 0;
            break;
        case 8: // NET_OP_CLOSE
            result = await bridge.socketClose(fd);
            break;
        case 9: // NET_OP_HAS_DATA
            result = await bridge.socketHasData(fd);
            break;
        case 10: // NET_OP_HAS_PENDING_ACCEPT
            result = await bridge.socketHasPendingAccept(fd);
            break;
        case 13: // NET_OP_SHUTDOWN
            result = await bridge.socketShutdown(fd, arg1);
            break;
    }
    return { result, data: respData };
}

self.onmessage = async (e) => {
    const msg = e.data || {};
    if (msg.type === 'init') {
        try {
            bridge = new FriscyNetworkBridge(msg.proxyUrl, { certHash: msg.certHash || null });
            await Promise.race([
                bridge.connect(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('WebTransport connect timeout')), 10000)),
            ]);
            self.postMessage({ type: 'ready' });
        } catch (err) {
            self.postMessage({ type: 'error', message: err?.message || String(err) });
        }
        return;
    }

    if (msg.type === 'rpc') {
        try {
            const payload = msg.data ? new Uint8Array(msg.data) : null;
            const resp = await dispatch(msg.op, msg.fd, msg.arg1, msg.arg2, payload);
            if (resp.data && resp.data.buffer) {
                self.postMessage({
                    type: 'rpc_result',
                    id: msg.id,
                    result: resp.result,
                    data: resp.data.buffer,
                }, [resp.data.buffer]);
            } else {
                self.postMessage({
                    type: 'rpc_result',
                    id: msg.id,
                    result: resp.result,
                    data: null,
                });
            }
        } catch (err) {
            self.postMessage({
                type: 'rpc_result',
                id: msg.id,
                result: -1,
                data: null,
                error: err?.message || String(err),
            });
        }
    }
};
