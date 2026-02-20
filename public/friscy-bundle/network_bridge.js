// network_bridge.js - WebTransport network bridge for friscy
export class NetworkBridge {
    constructor(proxyUrl) {
        this.proxyUrl = proxyUrl;
        this.transport = null;
        this.sockets = new Map(); // fd -> stream
        this.nextFd = 1000;
    }

    async connect() {
        if (this.transport) return;
        // @ts-ignore
        this.transport = new WebTransport(this.proxyUrl);
        await this.transport.ready;
        console.log('[net] WebTransport connected');
    }

    async socketCreate(fd, domain, type) {
        console.log(`[net] socketCreate fd=${fd} domain=${domain} type=${type}`);
        this.sockets.set(fd, { fd, domain, type, stream: null, writer: null, reader: null });
        return 0;
    }

    async socketConnect(fd, addrData) {
        const socket = this.sockets.get(fd);
        if (!socket) return -9; // EBADF

        try {
            // @ts-ignore
            const stream = await this.transport.createBidirectionalStream();
            socket.stream = stream;
            socket.writer = stream.writable.getWriter();
            socket.reader = stream.readable.getReader();

            // Send connect header
            await socket.writer.write(new Uint8Array([1, ...addrData]));
            return 0;
        } catch (e) {
            console.error('[net] connect failed:', e);
            return -1;
        }
    }

    async socketSend(fd, data) {
        const socket = this.sockets.get(fd);
        if (!socket || !socket.writer) return -9;
        try {
            await socket.writer.write(data);
            return data.length;
        } catch (e) {
            console.error('[net] send failed:', e);
            return -1;
        }
    }

    async socketRecv(fd, maxLen) {
        const socket = this.sockets.get(fd);
        if (!socket || !socket.reader) return -9;
        try {
            const { value, done } = await socket.reader.read();
            if (done) return 0;
            return value.subarray(0, maxLen);
        } catch (e) {
            console.error('[net] recv failed:', e);
            return null;
        }
    }

    async socketClose(fd) {
        const socket = this.sockets.get(fd);
        if (socket) {
            if (socket.writer) await socket.writer.close();
            if (socket.reader) await socket.reader.cancel();
            this.sockets.delete(fd);
        }
        return 0;
    }
}
