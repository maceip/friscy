/**
 * network_bridge.js - WebSocket bridge for friscy networking
 *
 * This connects the Wasm-side socket syscalls to a host-side network proxy
 * using gvisor-tap-vsock. The proxy handles actual TCP/UDP connections.
 *
 * Architecture:
 *   Browser (friscy.wasm) <--WebSocket--> Host (Go gvisor-tap-vsock proxy)
 *                                               |
 *                                               v
 *                                         Real Network
 *
 * Usage:
 *   // In browser, before loading friscy
 *   import { setupNetworkBridge } from './network_bridge.js';
 *   const Module = await createFriscy();
 *   setupNetworkBridge(Module, 'ws://localhost:8765');
 */

// Socket state tracking
const sockets = new Map();

// WebSocket connection to host proxy
let proxyConnection = null;
let proxyUrl = null;
let pendingConnects = new Map();
let messageQueue = [];

/**
 * Message types for proxy communication
 */
const MSG = {
  // From Wasm to proxy
  SOCKET_CREATE: 0x01,
  SOCKET_CONNECT: 0x02,
  SOCKET_BIND: 0x03,
  SOCKET_LISTEN: 0x04,
  SOCKET_ACCEPT: 0x05,
  SOCKET_SEND: 0x06,
  SOCKET_CLOSE: 0x07,

  // From proxy to Wasm
  CONNECT_OK: 0x81,
  CONNECT_FAIL: 0x82,
  DATA: 0x83,
  ACCEPT_NEW: 0x84,
  CLOSED: 0x85,
  ERROR: 0x86,
};

/**
 * Set up the network bridge for a friscy Module
 * @param {Object} Module - Emscripten Module object
 * @param {string} wsUrl - WebSocket URL for the host proxy (e.g., 'ws://localhost:8765')
 */
export function setupNetworkBridge(Module, wsUrl) {
  proxyUrl = wsUrl;

  // Connect to proxy
  connectToProxy();

  // Install callbacks that network.hpp will call
  Module.onSocketCreated = (fd, domain, type) => {
    sockets.set(fd, {
      fd,
      domain,
      type,
      connected: false,
      recvBuffer: [],
    });

    sendToProxy({
      type: MSG.SOCKET_CREATE,
      fd,
      domain,
      type,
    });
  };

  Module.onSocketClosed = (fd) => {
    sendToProxy({
      type: MSG.SOCKET_CLOSE,
      fd,
    });
    sockets.delete(fd);
  };

  Module.onSocketConnect = (fd, addrData) => {
    const sock = sockets.get(fd);
    if (!sock) return -88; // ENOTSOCK

    // Parse sockaddr_in or sockaddr_in6
    const view = new DataView(addrData.buffer, addrData.byteOffset);
    const family = view.getUint16(0, true);

    let host, port;
    if (family === 2) {
      // AF_INET
      port = view.getUint16(2, false); // Network byte order
      const ip = view.getUint32(4, false);
      host = `${(ip >> 24) & 0xff}.${(ip >> 16) & 0xff}.${(ip >> 8) & 0xff}.${ip & 0xff}`;
    } else if (family === 10) {
      // AF_INET6
      port = view.getUint16(2, false);
      const bytes = new Uint8Array(addrData.buffer, addrData.byteOffset + 8, 16);
      host = formatIPv6(bytes);
    } else {
      return -97; // EAFNOSUPPORT
    }

    // Send connect request to proxy
    sendToProxy({
      type: MSG.SOCKET_CONNECT,
      fd,
      host,
      port,
      sockType: sock.type,
    });

    // For non-blocking sockets, return EINPROGRESS
    // The proxy will send CONNECT_OK or CONNECT_FAIL later
    return -115; // EINPROGRESS
  };

  Module.onSocketBind = (fd, addrData) => {
    const sock = sockets.get(fd);
    if (!sock) return -88;

    const view = new DataView(addrData.buffer, addrData.byteOffset);
    const family = view.getUint16(0, true);
    const port = view.getUint16(2, false);

    sendToProxy({
      type: MSG.SOCKET_BIND,
      fd,
      family,
      port,
    });

    return 0;
  };

  Module.onSocketListen = (fd, backlog) => {
    sendToProxy({
      type: MSG.SOCKET_LISTEN,
      fd,
      backlog,
    });
    return 0;
  };

  Module.onSocketSend = (fd, data) => {
    const sock = sockets.get(fd);
    if (!sock) return -88;
    if (!sock.connected && sock.type === 1) return -107; // ENOTCONN

    sendToProxy({
      type: MSG.SOCKET_SEND,
      fd,
      data: Array.from(data),
    });

    return data.length;
  };

  Module.onSocketShutdown = (fd, how) => {
    sendToProxy({
      type: MSG.SOCKET_CLOSE,
      fd,
      how,
    });
  };

  // Method to push received data to a socket's buffer
  Module.pushSocketData = (fd, data) => {
    const sock = sockets.get(fd);
    if (sock) {
      sock.recvBuffer.push(...data);
    }
  };

  // Method to check if socket has data
  Module.hasSocketData = (fd) => {
    const sock = sockets.get(fd);
    return sock && sock.recvBuffer.length > 0;
  };

  // Method to read data from socket buffer
  Module.readSocketData = (fd, maxLen) => {
    const sock = sockets.get(fd);
    if (!sock || sock.recvBuffer.length === 0) {
      return null;
    }
    const len = Math.min(maxLen, sock.recvBuffer.length);
    return sock.recvBuffer.splice(0, len);
  };
}

/**
 * Connect to the host-side proxy
 */
function connectToProxy() {
  if (!proxyUrl) return;

  try {
    proxyConnection = new WebSocket(proxyUrl);
    proxyConnection.binaryType = 'arraybuffer';

    proxyConnection.onopen = () => {
      console.log('[friscy-net] Connected to proxy');
      // Send queued messages
      for (const msg of messageQueue) {
        proxyConnection.send(JSON.stringify(msg));
      }
      messageQueue = [];
    };

    proxyConnection.onmessage = (event) => {
      handleProxyMessage(event.data);
    };

    proxyConnection.onclose = () => {
      console.log('[friscy-net] Proxy connection closed, reconnecting...');
      proxyConnection = null;
      setTimeout(connectToProxy, 1000);
    };

    proxyConnection.onerror = (err) => {
      console.error('[friscy-net] Proxy connection error:', err);
    };
  } catch (e) {
    console.error('[friscy-net] Failed to connect to proxy:', e);
    setTimeout(connectToProxy, 1000);
  }
}

/**
 * Send a message to the proxy
 */
function sendToProxy(msg) {
  if (proxyConnection && proxyConnection.readyState === WebSocket.OPEN) {
    proxyConnection.send(JSON.stringify(msg));
  } else {
    messageQueue.push(msg);
  }
}

/**
 * Handle message from proxy
 */
function handleProxyMessage(data) {
  let msg;
  if (typeof data === 'string') {
    msg = JSON.parse(data);
  } else {
    // Binary data - extract header and payload
    const view = new DataView(data);
    const type = view.getUint8(0);
    const fd = view.getUint32(1, true);
    const payload = new Uint8Array(data, 5);

    msg = { type, fd, data: Array.from(payload) };
  }

  const sock = sockets.get(msg.fd);
  if (!sock && msg.type !== MSG.ERROR) {
    return;
  }

  switch (msg.type) {
    case MSG.CONNECT_OK:
      sock.connected = true;
      // Resolve pending connect
      const resolve = pendingConnects.get(msg.fd);
      if (resolve) {
        resolve(0);
        pendingConnects.delete(msg.fd);
      }
      break;

    case MSG.CONNECT_FAIL:
      sock.connected = false;
      const reject = pendingConnects.get(msg.fd);
      if (reject) {
        reject(msg.error || -111); // ECONNREFUSED
        pendingConnects.delete(msg.fd);
      }
      break;

    case MSG.DATA:
      if (sock) {
        sock.recvBuffer.push(...msg.data);
      }
      break;

    case MSG.CLOSED:
      if (sock) {
        sock.connected = false;
      }
      break;

    case MSG.ERROR:
      console.error('[friscy-net] Proxy error:', msg.message);
      break;
  }
}

/**
 * Format IPv6 bytes as string
 */
function formatIPv6(bytes) {
  const parts = [];
  for (let i = 0; i < 16; i += 2) {
    parts.push(((bytes[i] << 8) | bytes[i + 1]).toString(16));
  }
  return parts.join(':');
}

/**
 * Check if networking is available
 */
export function isNetworkAvailable() {
  return proxyConnection && proxyConnection.readyState === WebSocket.OPEN;
}

/**
 * Disconnect from proxy
 */
export function disconnectNetwork() {
  if (proxyConnection) {
    proxyConnection.close();
    proxyConnection = null;
  }
  sockets.clear();
  messageQueue = [];
}
