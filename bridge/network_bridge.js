/**
 * network_bridge.js - WebTransport bridge for friscy networking
 *
 * This connects the Wasm-side socket syscalls to a host-side network proxy
 * using WebTransport (HTTP/3 + QUIC) for bidirectional communication.
 *
 * Key features:
 *   - Full TCP/UDP support including incoming connections (listen/accept)
 *   - Bidirectional streams for TCP connections
 *   - Datagrams for UDP
 *   - Automatic reconnection
 *
 * Architecture:
 *   Browser (friscy.wasm) <--WebTransport--> Host (Go proxy with gvisor-tap-vsock)
 *                                                   |
 *                                                   v
 *                                             Real Network
 *
 * Usage:
 *   import { FriscyNetworkBridge } from './network_bridge.js';
 *   const bridge = new FriscyNetworkBridge('https://localhost:4433/connect');
 *   await bridge.connect();
 *   bridge.attachModule(Module);
 */

// Protocol message types (must match proxy/main.go)
const MSG = {
  // Container -> Host (requests)
  CONNECT: 0x01,
  BIND: 0x02,
  LISTEN: 0x03,
  SEND: 0x04,
  CLOSE: 0x05,
  SEND_TO: 0x06,

  // Host -> Container (responses/events)
  CONNECTED: 0x81,
  CONNECT_ERROR: 0x82,
  DATA: 0x83,
  ACCEPT: 0x84,
  CLOSED: 0x85,
  ERROR: 0x86,
  RECV_FROM: 0x87,
};

// Socket types
const SOCK_STREAM = 1;
const SOCK_DGRAM = 2;

/**
 * Main network bridge class using WebTransport
 */
export class FriscyNetworkBridge {
  constructor(proxyUrl) {
    this.proxyUrl = proxyUrl;
    this.transport = null;
    this.connected = false;
    this.reconnecting = false;

    // Connection tracking
    this.connections = new Map(); // connID -> ConnectionState
    this.nextConnID = 1;
    this.fdToConnID = new Map(); // fd -> connID

    // Accept queue for incoming connections
    this.acceptQueues = new Map(); // listenerConnID -> [newConnID, ...]

    // Callbacks
    this.onAccept = null; // (listenerFd, newFd, remoteAddr) => void
    this.Module = null;
  }

  /**
   * Connect to the proxy server
   */
  async connect() {
    if (this.connected) return;

    try {
      this.transport = new WebTransport(this.proxyUrl);
      await this.transport.ready;
      this.connected = true;
      this.reconnecting = false;
      console.log('[friscy-net] Connected to proxy via WebTransport');

      // Start reading incoming streams
      this.readIncomingStreams();

      // Start reading datagrams
      this.readDatagrams();

      // Handle connection close
      this.transport.closed.then(() => {
        console.log('[friscy-net] WebTransport connection closed');
        this.handleDisconnect();
      }).catch(err => {
        console.error('[friscy-net] WebTransport error:', err);
        this.handleDisconnect();
      });

    } catch (e) {
      console.error('[friscy-net] Failed to connect:', e);
      this.scheduleReconnect();
      throw e;
    }
  }

  /**
   * Attach Emscripten Module and install callbacks
   */
  attachModule(Module) {
    this.Module = Module;

    Module.onSocketCreated = (fd, domain, type) => {
      const connID = this.nextConnID++;
      this.fdToConnID.set(fd, connID);
      this.connections.set(connID, {
        id: connID,
        fd,
        domain,
        type,
        connected: false,
        isListener: false,
        recvBuffer: [],
      });
    };

    Module.onSocketConnect = (fd, addrData) => {
      return this.handleConnect(fd, addrData);
    };

    Module.onSocketBind = (fd, addrData) => {
      return this.handleBind(fd, addrData);
    };

    Module.onSocketListen = (fd, backlog) => {
      return this.handleListen(fd, backlog);
    };

    Module.onSocketAccept = (fd) => {
      return this.handleAccept(fd);
    };

    Module.onSocketSend = (fd, data) => {
      return this.handleSend(fd, data);
    };

    Module.onSocketClosed = (fd) => {
      return this.handleClose(fd);
    };

    Module.onSocketShutdown = (fd, how) => {
      return this.handleClose(fd);
    };

    // Methods for reading data
    Module.hasSocketData = (fd) => {
      const connID = this.fdToConnID.get(fd);
      const conn = this.connections.get(connID);
      return conn && conn.recvBuffer.length > 0;
    };

    Module.readSocketData = (fd, maxLen) => {
      const connID = this.fdToConnID.get(fd);
      const conn = this.connections.get(connID);
      if (!conn || conn.recvBuffer.length === 0) return null;
      const len = Math.min(maxLen, conn.recvBuffer.length);
      return conn.recvBuffer.splice(0, len);
    };

    // Check for pending accepts
    Module.hasPendingAccept = (fd) => {
      const connID = this.fdToConnID.get(fd);
      const queue = this.acceptQueues.get(connID);
      return queue && queue.length > 0;
    };
  }

  /**
   * Handle outgoing connect request
   */
  handleConnect(fd, addrData) {
    const connID = this.fdToConnID.get(fd);
    const conn = this.connections.get(connID);
    if (!conn) return -88; // ENOTSOCK

    const { host, port, family } = this.parseAddress(addrData);
    if (!host) return -97; // EAFNOSUPPORT

    const sockType = conn.type === 1 ? SOCK_STREAM : SOCK_DGRAM;

    // Build connect message: msgType(1) + connID(4) + sockType(1) + hostLen(2) + host + port(2)
    const hostBytes = new TextEncoder().encode(host);
    const msg = new Uint8Array(1 + 4 + 1 + 2 + hostBytes.length + 2);
    const view = new DataView(msg.buffer);

    msg[0] = MSG.CONNECT;
    view.setUint32(1, connID, false); // Big endian
    msg[5] = sockType;
    view.setUint16(6, hostBytes.length, false);
    msg.set(hostBytes, 8);
    view.setUint16(8 + hostBytes.length, port, false);

    this.sendMessage(msg);

    // Return EINPROGRESS for async connect
    return -115;
  }

  /**
   * Handle bind request
   */
  handleBind(fd, addrData) {
    const connID = this.fdToConnID.get(fd);
    const conn = this.connections.get(connID);
    if (!conn) return -88;

    const { port, family } = this.parseAddress(addrData);
    const sockType = conn.type === 1 ? SOCK_STREAM : SOCK_DGRAM;

    // Build bind message: msgType(1) + connID(4) + sockType(1) + port(2)
    const msg = new Uint8Array(1 + 4 + 1 + 2);
    const view = new DataView(msg.buffer);

    msg[0] = MSG.BIND;
    view.setUint32(1, connID, false);
    msg[5] = sockType;
    view.setUint16(6, port, false);

    this.sendMessage(msg);
    return 0;
  }

  /**
   * Handle listen request
   */
  handleListen(fd, backlog) {
    const connID = this.fdToConnID.get(fd);
    const conn = this.connections.get(connID);
    if (!conn) return -88;

    conn.isListener = true;
    this.acceptQueues.set(connID, []);

    // Build listen message: msgType(1) + connID(4) + backlog(4)
    const msg = new Uint8Array(1 + 4 + 4);
    const view = new DataView(msg.buffer);

    msg[0] = MSG.LISTEN;
    view.setUint32(1, connID, false);
    view.setUint32(5, backlog, false);

    this.sendMessage(msg);
    return 0;
  }

  /**
   * Handle accept - returns new fd or EAGAIN if no pending connections
   */
  handleAccept(fd) {
    const connID = this.fdToConnID.get(fd);
    const queue = this.acceptQueues.get(connID);

    if (!queue || queue.length === 0) {
      return -11; // EAGAIN - no pending connections
    }

    const accepted = queue.shift();
    const newConn = this.connections.get(accepted.newConnID);
    if (!newConn) return -11;

    // Return the fd of the new connection
    return { fd: newConn.fd, addr: accepted.remoteAddr };
  }

  /**
   * Handle send data
   */
  handleSend(fd, data) {
    const connID = this.fdToConnID.get(fd);
    const conn = this.connections.get(connID);
    if (!conn) return -88;
    if (!conn.connected && conn.type === 1) return -107; // ENOTCONN

    // Build send message: msgType(1) + connID(4) + dataLen(4) + data
    const msg = new Uint8Array(1 + 4 + 4 + data.length);
    const view = new DataView(msg.buffer);

    msg[0] = MSG.SEND;
    view.setUint32(1, connID, false);
    view.setUint32(5, data.length, false);
    msg.set(data, 9);

    this.sendMessage(msg);
    return data.length;
  }

  /**
   * Handle close
   */
  handleClose(fd) {
    const connID = this.fdToConnID.get(fd);
    if (!connID) return 0;

    // Build close message: msgType(1) + connID(4)
    const msg = new Uint8Array(1 + 4);
    const view = new DataView(msg.buffer);

    msg[0] = MSG.CLOSE;
    view.setUint32(1, connID, false);

    this.sendMessage(msg);

    // Cleanup
    this.connections.delete(connID);
    this.fdToConnID.delete(fd);
    this.acceptQueues.delete(connID);

    return 0;
  }

  /**
   * Send a message over a new bidirectional stream
   */
  async sendMessage(data) {
    if (!this.connected || !this.transport) {
      console.warn('[friscy-net] Not connected, dropping message');
      return;
    }

    try {
      const stream = await this.transport.createBidirectionalStream();
      const writer = stream.writable.getWriter();
      await writer.write(data);
      await writer.close();
    } catch (e) {
      console.error('[friscy-net] Failed to send message:', e);
    }
  }

  /**
   * Read incoming unidirectional streams from proxy
   */
  async readIncomingStreams() {
    if (!this.transport) return;

    const reader = this.transport.incomingUnidirectionalStreams.getReader();

    try {
      while (true) {
        const { value: stream, done } = await reader.read();
        if (done) break;

        this.handleIncomingStream(stream);
      }
    } catch (e) {
      if (this.connected) {
        console.error('[friscy-net] Error reading streams:', e);
      }
    }
  }

  /**
   * Handle a single incoming stream
   */
  async handleIncomingStream(stream) {
    try {
      const reader = stream.getReader();
      const chunks = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      // Combine chunks
      const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
      const data = new Uint8Array(totalLen);
      let offset = 0;
      for (const chunk of chunks) {
        data.set(chunk, offset);
        offset += chunk.length;
      }

      this.handleProxyMessage(data);
    } catch (e) {
      console.error('[friscy-net] Error handling stream:', e);
    }
  }

  /**
   * Read incoming datagrams (for UDP)
   */
  async readDatagrams() {
    if (!this.transport) return;

    const reader = this.transport.datagrams.readable.getReader();

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        // Format: msgType(1) + connID(4) + data
        if (value.length >= 5) {
          const connID = new DataView(value.buffer).getUint32(1, false);
          const payload = value.slice(5);

          const conn = this.connections.get(connID);
          if (conn) {
            conn.recvBuffer.push(...payload);
          }
        }
      }
    } catch (e) {
      if (this.connected) {
        console.error('[friscy-net] Error reading datagrams:', e);
      }
    }
  }

  /**
   * Handle message from proxy
   */
  handleProxyMessage(data) {
    if (data.length < 9) return;

    const view = new DataView(data.buffer, data.byteOffset);
    const msgType = data[0];
    const connID = view.getUint32(1, false);
    const dataLen = view.getUint32(5, false);
    const payload = data.slice(9, 9 + dataLen);

    const conn = this.connections.get(connID);

    switch (msgType) {
      case MSG.CONNECTED:
        if (conn) {
          conn.connected = true;
          console.log(`[friscy-net] Connection ${connID} established`);
        }
        break;

      case MSG.CONNECT_ERROR:
        if (conn) {
          conn.connected = false;
          const errorMsg = new TextDecoder().decode(payload);
          console.error(`[friscy-net] Connection ${connID} failed: ${errorMsg}`);
        }
        break;

      case MSG.DATA:
        if (conn) {
          conn.recvBuffer.push(...payload);
        }
        break;

      case MSG.ACCEPT:
        this.handleAcceptNotification(payload);
        break;

      case MSG.CLOSED:
        if (conn) {
          conn.connected = false;
          console.log(`[friscy-net] Connection ${connID} closed by remote`);
        }
        break;

      case MSG.ERROR:
        console.error(`[friscy-net] Error for connection ${connID}:`,
          new TextDecoder().decode(payload));
        break;
    }
  }

  /**
   * Handle accept notification from proxy
   */
  handleAcceptNotification(payload) {
    if (payload.length < 10) return;

    const view = new DataView(payload.buffer, payload.byteOffset);
    const listenerConnID = view.getUint32(0, false);
    const newConnID = view.getUint32(4, false);
    const addrLen = view.getUint16(8, false);
    const remoteAddr = new TextDecoder().decode(payload.slice(10, 10 + addrLen));

    console.log(`[friscy-net] Accept on listener ${listenerConnID}: new conn ${newConnID} from ${remoteAddr}`);

    // Create new connection state
    const listenerConn = this.connections.get(listenerConnID);
    if (!listenerConn) return;

    // Allocate new fd for the accepted connection
    const newFd = this.allocateFd();
    this.fdToConnID.set(newFd, newConnID);
    this.connections.set(newConnID, {
      id: newConnID,
      fd: newFd,
      domain: listenerConn.domain,
      type: listenerConn.type,
      connected: true,
      isListener: false,
      recvBuffer: [],
    });

    // Add to accept queue
    const queue = this.acceptQueues.get(listenerConnID);
    if (queue) {
      queue.push({ newConnID, remoteAddr, fd: newFd });
    }

    // Call accept callback if registered
    if (this.onAccept) {
      this.onAccept(listenerConn.fd, newFd, remoteAddr);
    }
  }

  /**
   * Allocate a new file descriptor
   */
  allocateFd() {
    // Start from 100 to avoid conflicts with stdin/stdout/stderr and other fds
    let fd = 100;
    while (this.fdToConnID.has(fd)) {
      fd++;
    }
    return fd;
  }

  /**
   * Parse sockaddr structure
   */
  parseAddress(addrData) {
    const view = new DataView(addrData.buffer, addrData.byteOffset);
    const family = view.getUint16(0, true);

    if (family === 2) {
      // AF_INET
      const port = view.getUint16(2, false); // Network byte order
      const ip = view.getUint32(4, false);
      const host = `${(ip >> 24) & 0xff}.${(ip >> 16) & 0xff}.${(ip >> 8) & 0xff}.${ip & 0xff}`;
      return { host, port, family };
    } else if (family === 10) {
      // AF_INET6
      const port = view.getUint16(2, false);
      const bytes = new Uint8Array(addrData.buffer, addrData.byteOffset + 8, 16);
      const host = this.formatIPv6(bytes);
      return { host, port, family };
    }

    return { host: null, port: 0, family };
  }

  /**
   * Format IPv6 address
   */
  formatIPv6(bytes) {
    const parts = [];
    for (let i = 0; i < 16; i += 2) {
      parts.push(((bytes[i] << 8) | bytes[i + 1]).toString(16));
    }
    return parts.join(':');
  }

  /**
   * Handle disconnect
   */
  handleDisconnect() {
    this.connected = false;
    this.transport = null;

    // Mark all connections as disconnected
    for (const conn of this.connections.values()) {
      conn.connected = false;
    }

    this.scheduleReconnect();
  }

  /**
   * Schedule reconnection attempt
   */
  scheduleReconnect() {
    if (this.reconnecting) return;
    this.reconnecting = true;

    console.log('[friscy-net] Reconnecting in 2 seconds...');
    setTimeout(() => {
      this.reconnecting = false;
      this.connect().catch(() => {});
    }, 2000);
  }

  /**
   * Check if network is available
   */
  isAvailable() {
    return this.connected && this.transport !== null;
  }

  /**
   * Disconnect from proxy
   */
  disconnect() {
    if (this.transport) {
      this.transport.close();
      this.transport = null;
    }
    this.connected = false;
    this.connections.clear();
    this.fdToConnID.clear();
    this.acceptQueues.clear();
  }
}

// Legacy API for backward compatibility
let defaultBridge = null;

export function setupNetworkBridge(Module, url) {
  // Convert ws:// to https:// for WebTransport
  const wtUrl = url.replace(/^ws:\/\//, 'https://').replace(/^wss:\/\//, 'https://');

  defaultBridge = new FriscyNetworkBridge(wtUrl);
  defaultBridge.connect().then(() => {
    defaultBridge.attachModule(Module);
  }).catch(err => {
    console.error('[friscy-net] Initial connection failed:', err);
  });

  return defaultBridge;
}

export function isNetworkAvailable() {
  return defaultBridge && defaultBridge.isAvailable();
}

export function disconnectNetwork() {
  if (defaultBridge) {
    defaultBridge.disconnect();
    defaultBridge = null;
  }
}
