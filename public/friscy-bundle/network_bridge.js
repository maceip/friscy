// network_bridge.js - WebTransport bridge that matches proxy/main.go protocol.
export class NetworkBridge {
    constructor(proxyUrl, options = {}) {
        this.proxyUrl = proxyUrl;
        this.certHash = options.certHash || null;
        this.transport = null;
        this.sockets = new Map(); // local fd -> socket state
        this.remoteToLocal = new Map(); // proxy conn id -> local fd
        this.unboundAccepted = []; // accepted proxy conns waiting for local fd adoption
    }

    async connect() {
        if (this.transport) return;
        let transportOptions;
        if (this.certHash) {
            const hashB64 = this.certHash.replace(/\s+/g, '');
            let decoded;
            try {
                decoded = atob(hashB64);
            } catch {
                throw new Error('Invalid proxycert hash (expected base64 sha256)');
            }
            const bytes = new Uint8Array(decoded.length);
            for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
            transportOptions = {
                serverCertificateHashes: [{ algorithm: 'sha-256', value: bytes }],
            };
        }

        // @ts-ignore
        this.transport = new WebTransport(this.proxyUrl, transportOptions);
        await this.transport.ready;
        this._startIncomingLoop();
        console.log('[net] WebTransport connected');
    }

    async socketCreate(fd, domain, type) {
        const socket = {
            fd,
            domain,
            type,
            remoteConnId: fd,
            recvQueue: [],
            pendingAccept: [],
            connectResolve: null,
            connectReject: null,
            bindResolve: null,
            bindReject: null,
        };
        this.sockets.set(fd, socket);

        // Accept path: C++ calls onSocketAccept(), then allocates a new local fd.
        // Adopt the queued proxy accepted connection when this new fd appears.
        if (this.unboundAccepted.length > 0) {
            const accepted = this.unboundAccepted.shift();
            socket.remoteConnId = accepted.remoteConnId;
            this.remoteToLocal.set(accepted.remoteConnId, fd);
            if (accepted.queuedData && accepted.queuedData.length) {
                socket.recvQueue.push(...accepted.queuedData);
            }
        } else {
            this.remoteToLocal.set(fd, fd);
        }
        return 0;
    }

    async socketConnect(fd, addrData) {
        const socket = this.sockets.get(fd);
        if (!socket) return -9; // EBADF
        if (!this.transport) return -107; // ENOTCONN

        const parsed = this._parseSockaddr(addrData);
        if (!parsed) return -97; // EAFNOSUPPORT
        const { host, port } = parsed;
        const sockType = (socket.type & 0xf) === 2 ? 2 : 1; // SOCK_DGRAM=2 else SOCK_STREAM=1

        const hostBytes = new TextEncoder().encode(host);
        const body = new Uint8Array(4 + 1 + 2 + hostBytes.length + 2);
        this._writeU32BE(body, 0, socket.remoteConnId);
        body[4] = sockType;
        this._writeU16BE(body, 5, hostBytes.length);
        body.set(hostBytes, 7);
        this._writeU16BE(body, 7 + hostBytes.length, port);

        const wait = new Promise((resolve, reject) => {
            socket.connectResolve = resolve;
            socket.connectReject = reject;
        });
        await this._sendMessage(0x01, body); // MsgConnect
        try {
            await Promise.race([
                wait,
                new Promise((_, reject) => setTimeout(() => reject(new Error('connect timeout')), 15000)),
            ]);
            return 0;
        } catch (e) {
            console.warn('[net] connect failed', host, port, String(e?.message || e));
            return -111; // ECONNREFUSED
        } finally {
            socket.connectResolve = null;
            socket.connectReject = null;
        }
    }

    async socketBind(fd, addrData) {
        const socket = this.sockets.get(fd);
        if (!socket) return -9;
        if (!this.transport) return -107;
        const parsed = this._parseSockaddr(addrData);
        if (!parsed) return -97;
        const sockType = (socket.type & 0xf) === 2 ? 2 : 1;

        const body = new Uint8Array(4 + 1 + 2);
        this._writeU32BE(body, 0, socket.remoteConnId);
        body[4] = sockType;
        this._writeU16BE(body, 5, parsed.port);

        const wait = new Promise((resolve, reject) => {
            socket.bindResolve = resolve;
            socket.bindReject = reject;
        });
        await this._sendMessage(0x02, body); // MsgBind
        try {
            await Promise.race([
                wait,
                new Promise((_, reject) => setTimeout(() => reject(new Error('bind timeout')), 15000)),
            ]);
            return 0;
        } catch (e) {
            console.warn('[net] bind failed', String(e?.message || e));
            return -98; // EADDRINUSE/other bind failure
        } finally {
            socket.bindResolve = null;
            socket.bindReject = null;
        }
    }

    async socketListen(fd, backlog) {
        const socket = this.sockets.get(fd);
        if (!socket) return -9;
        if (!this.transport) return -107;
        const body = new Uint8Array(8);
        this._writeU32BE(body, 0, socket.remoteConnId);
        this._writeU32BE(body, 4, backlog >>> 0);
        await this._sendMessage(0x03, body); // MsgListen
        return 0;
    }

    async socketAccept(fd) {
        const socket = this.sockets.get(fd);
        if (!socket) return { result: -9, addr: null };
        if (!socket.pendingAccept.length) return { result: -11, addr: null }; // EAGAIN
        const accepted = socket.pendingAccept.shift();
        this.unboundAccepted.push(accepted);
        return { result: accepted.remoteConnId, addr: accepted.addr || new Uint8Array(0) };
    }

    async socketSend(fd, data) {
        const socket = this.sockets.get(fd);
        if (!socket) return -9;
        if (!this.transport) return -107;
        const payload = data instanceof Uint8Array ? data : new Uint8Array(data);
        const body = new Uint8Array(8 + payload.length);
        this._writeU32BE(body, 0, socket.remoteConnId);
        this._writeU32BE(body, 4, payload.length);
        body.set(payload, 8);
        await this._sendMessage(0x04, body); // MsgSend
        return payload.length;
    }

    async socketRecv(fd, maxLen) {
        const socket = this.sockets.get(fd);
        if (!socket) return null;
        if (socket.recvQueue.length === 0) return null;

        const chunk = socket.recvQueue[0];
        if (chunk.length <= maxLen) {
            socket.recvQueue.shift();
            return chunk;
        }
        const head = chunk.subarray(0, maxLen);
        socket.recvQueue[0] = chunk.subarray(maxLen);
        return head;
    }

    async socketHasData(fd) {
        const socket = this.sockets.get(fd);
        return socket && socket.recvQueue.length > 0 ? 1 : 0;
    }

    async socketHasPendingAccept(fd) {
        const socket = this.sockets.get(fd);
        return socket && socket.pendingAccept.length > 0 ? 1 : 0;
    }

    async socketShutdown(fd) {
        return this.socketClose(fd);
    }

    async socketClose(fd) {
        const socket = this.sockets.get(fd);
        if (!socket) return 0;
        if (this.transport) {
            const body = new Uint8Array(4);
            this._writeU32BE(body, 0, socket.remoteConnId);
            await this._sendMessage(0x05, body); // MsgClose
        }
        this.remoteToLocal.delete(socket.remoteConnId);
        this.sockets.delete(fd);
        return 0;
    }

    _parseSockaddr(addrData) {
        if (!addrData || addrData.length < 8) return null;
        const dv = new DataView(addrData.buffer, addrData.byteOffset, addrData.byteLength);
        const family = dv.getUint16(0, true);
        if (family !== 2) { // AF_INET
            return null;
        }
        const port = dv.getUint16(2, false);
        const host = `${addrData[4]}.${addrData[5]}.${addrData[6]}.${addrData[7]}`;
        return { host, port };
    }

    async _sendMessage(msgType, body) {
        if (!this.transport) throw new Error('transport not connected');
        // @ts-ignore
        const stream = await this.transport.createBidirectionalStream();
        const writer = stream.writable.getWriter();
        const frame = new Uint8Array(1 + body.length);
        frame[0] = msgType; // varint single-byte for <= 127
        frame.set(body, 1);
        await writer.write(frame);
        await writer.close();
    }

    async _startIncomingLoop() {
        try {
            const reader = this.transport.incomingBidirectionalStreams.getReader();
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                this._handleIncomingStream(value).catch((e) => {
                    console.warn('[net] incoming stream error', e?.message || e);
                });
            }
        } catch (e) {
            console.warn('[net] incoming loop closed', e?.message || e);
        }
    }

    async _handleIncomingStream(stream) {
        const reader = stream.readable.getReader();
        const chunks = [];
        let total = 0;
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            chunks.push(value);
            total += value.length;
        }
        if (total < 9) return;
        const frame = new Uint8Array(total);
        let off = 0;
        for (const c of chunks) {
            frame.set(c, off);
            off += c.length;
        }

        const msgType = frame[0];
        const connId = this._readU32BE(frame, 1);
        const dataLen = this._readU32BE(frame, 5);
        const payload = frame.subarray(9, 9 + dataLen);

        if (msgType === 0x81) { // MsgConnected
            const localFd = this.remoteToLocal.get(connId) ?? connId;
            const socket = this.sockets.get(localFd);
            if (socket?.connectResolve) socket.connectResolve();
            if (socket?.bindResolve) socket.bindResolve();
            return;
        }
        if (msgType === 0x82 || msgType === 0x86) { // MsgConnectError/MsgError
            const localFd = this.remoteToLocal.get(connId) ?? connId;
            const socket = this.sockets.get(localFd);
            const msg = new TextDecoder().decode(payload);
            if (socket?.connectReject) socket.connectReject(new Error(msg || 'connect error'));
            if (socket?.bindReject) socket.bindReject(new Error(msg || 'bind error'));
            return;
        }
        if (msgType === 0x83) { // MsgData
            const localFd = this.remoteToLocal.get(connId);
            if (localFd == null) {
                // Data for an accepted conn that has not been adopted yet.
                let adopted = null;
                for (const pending of this.unboundAccepted) {
                    if (pending.remoteConnId === connId) {
                        adopted = pending;
                        break;
                    }
                }
                if (adopted) {
                    if (!adopted.queuedData) adopted.queuedData = [];
                    adopted.queuedData.push(payload.slice());
                }
                return;
            }
            const socket = this.sockets.get(localFd);
            if (socket) socket.recvQueue.push(payload.slice());
            return;
        }
        if (msgType === 0x84) { // MsgAccept
            if (payload.length < 10) return;
            const listenerRemote = this._readU32BE(payload, 0);
            const acceptedRemote = this._readU32BE(payload, 4);
            const addrLen = this._readU16BE(payload, 8);
            const addr = payload.subarray(10, 10 + addrLen).slice();
            const listenerLocal = this.remoteToLocal.get(listenerRemote) ?? listenerRemote;
            const listenerSocket = this.sockets.get(listenerLocal);
            if (listenerSocket) {
                listenerSocket.pendingAccept.push({ remoteConnId: acceptedRemote, addr, queuedData: [] });
            }
            return;
        }
        if (msgType === 0x85) { // MsgClosed
            const localFd = this.remoteToLocal.get(connId);
            if (localFd != null) {
                const socket = this.sockets.get(localFd);
                if (socket) socket.recvQueue.push(new Uint8Array(0));
            }
        }
    }

    _writeU16BE(buf, off, value) {
        buf[off] = (value >>> 8) & 0xff;
        buf[off + 1] = value & 0xff;
    }

    _writeU32BE(buf, off, value) {
        buf[off] = (value >>> 24) & 0xff;
        buf[off + 1] = (value >>> 16) & 0xff;
        buf[off + 2] = (value >>> 8) & 0xff;
        buf[off + 3] = value & 0xff;
    }

    _readU16BE(buf, off) {
        return (buf[off] << 8) | buf[off + 1];
    }

    _readU32BE(buf, off) {
        return (((buf[off] << 24) >>> 0) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
    }
}

export { NetworkBridge as FriscyNetworkBridge };
