/**
 * friscy-sync-server: WebSocket relay for cross-device VFS synchronization.
 *
 * Clients connect to /session/{sessionId} and exchange delta, full-sync,
 * and cursor messages.  The server never inspects payloads beyond the
 * envelope -- it simply relays to every other peer in the same room.
 *
 * Protocol (JSON over WebSocket):
 *
 *   Client -> Server:
 *     { type: "join",              sessionId, deviceId, deviceName }
 *     { type: "delta",             delta: {...} }
 *     { type: "full-sync-request"  }
 *     { type: "full-sync-response", overlayTar: "<base64>" }
 *     { type: "cursor",            cursor: {...} }
 *
 *   Server -> Client:
 *     { type: "joined",           sessionId, deviceId, peerCount, peers }
 *     { type: "peer-joined",      fromDeviceId, deviceName, peerCount }
 *     { type: "peer-left",        fromDeviceId, deviceName, peerCount }
 *     { type: "delta",            fromDeviceId, delta }
 *     { type: "full-sync-request", fromDeviceId }
 *     { type: "full-sync-response", fromDeviceId, overlayTar }
 *     { type: "cursor",           fromDeviceId, cursor }
 *     { type: "error",            message }
 *
 * Run:
 *   npm install && npm start
 *   Server listens on PORT (default 4567).
 *   Health check: GET http://localhost:4567/health
 */

const http = require("http");
const { WebSocketServer } = require("ws");

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT, 10) || 4567;
const MAX_MESSAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const PING_INTERVAL_MS = 30_000;
const ROOM_CLEANUP_DELAY_MS = 60_000;
const RATE_LIMIT_PER_SEC = 10;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} Peer
 * @property {import('ws').WebSocket} ws
 * @property {string}  deviceId
 * @property {string}  deviceName
 * @property {number}  tokens       - token-bucket counter for rate limiting
 * @property {number}  lastRefill   - timestamp of last token refill
 * @property {boolean} alive        - ping/pong liveness flag
 */

/** @type {Map<string, Map<string, Peer>>}  sessionId -> (deviceId -> Peer) */
const rooms = new Map();

/** @type {Map<string, NodeJS.Timeout>}  sessionId -> cleanup timer */
const roomCleanupTimers = new Map();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** ISO-8601 timestamp for log lines. */
function ts() {
  return new Date().toISOString();
}

/**
 * Token-bucket rate limiter.  Refills at RATE_LIMIT_PER_SEC tokens/sec,
 * burst capacity equals RATE_LIMIT_PER_SEC.
 * @param {Peer} peer
 * @returns {boolean} true if the message is allowed
 */
function rateLimitAllow(peer) {
  const now = Date.now();
  const elapsed = (now - peer.lastRefill) / 1000;
  peer.tokens = Math.min(RATE_LIMIT_PER_SEC, peer.tokens + elapsed * RATE_LIMIT_PER_SEC);
  peer.lastRefill = now;
  if (peer.tokens >= 1) {
    peer.tokens -= 1;
    return true;
  }
  return false;
}

/**
 * Broadcast a JSON object to every peer in the room except the sender.
 * @param {string} sessionId
 * @param {string} senderDeviceId
 * @param {object} msg
 */
function broadcast(sessionId, senderDeviceId, msg) {
  const room = rooms.get(sessionId);
  if (!room) return;
  const data = JSON.stringify(msg);
  for (const [deviceId, peer] of room) {
    if (deviceId === senderDeviceId) continue;
    if (peer.ws.readyState === peer.ws.OPEN) {
      peer.ws.send(data);
    }
  }
}

/**
 * Return the number of connected peers in a room.
 * @param {string} sessionId
 * @returns {number}
 */
function peerCount(sessionId) {
  const room = rooms.get(sessionId);
  return room ? room.size : 0;
}

/**
 * Schedule deletion of an empty room after ROOM_CLEANUP_DELAY_MS.
 * If a new client joins before the timer fires, the timer is cancelled.
 * @param {string} sessionId
 */
function scheduleRoomCleanup(sessionId) {
  if (roomCleanupTimers.has(sessionId)) return;
  const timer = setTimeout(() => {
    roomCleanupTimers.delete(sessionId);
    const room = rooms.get(sessionId);
    if (room && room.size === 0) {
      rooms.delete(sessionId);
      console.log(`[${ts()}] room "${sessionId}" cleaned up (empty for ${ROOM_CLEANUP_DELAY_MS / 1000}s)`);
    }
  }, ROOM_CLEANUP_DELAY_MS);
  // Allow the Node process to exit even if the timer is pending.
  timer.unref();
  roomCleanupTimers.set(sessionId, timer);
}

/**
 * Cancel a pending room-cleanup timer (e.g. when a new client joins).
 * @param {string} sessionId
 */
function cancelRoomCleanup(sessionId) {
  const timer = roomCleanupTimers.get(sessionId);
  if (timer) {
    clearTimeout(timer);
    roomCleanupTimers.delete(sessionId);
  }
}

/**
 * Extract sessionId from a URL path like /session/{sessionId}.
 * Returns null if the path does not match.
 * @param {string} urlPath
 * @returns {string|null}
 */
function parseSessionId(urlPath) {
  const match = urlPath.match(/^\/session\/([A-Za-z0-9_.-]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Send a JSON error message to a WebSocket client.
 * @param {import('ws').WebSocket} ws
 * @param {string} message
 */
function sendError(ws, message) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ type: "error", message }));
  }
}

// ---------------------------------------------------------------------------
// HTTP server (for /health endpoint and WebSocket upgrade)
// ---------------------------------------------------------------------------

const httpServer = http.createServer((req, res) => {
  // CORS headers for browser clients.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    let totalClients = 0;
    for (const room of rooms.values()) totalClients += room.size;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      uptime: Math.floor(process.uptime()),
      rooms: rooms.size,
      clients: totalClients,
    }));
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found\n");
});

// ---------------------------------------------------------------------------
// WebSocket server
// ---------------------------------------------------------------------------

const wss = new WebSocketServer({
  server: httpServer,
  maxPayload: MAX_MESSAGE_BYTES,
  // Validate the URL path before accepting the upgrade.
  verifyClient: ({ req }, cb) => {
    const sessionId = parseSessionId(req.url);
    if (!sessionId) {
      cb(false, 400, "Bad Request: URL must be /session/{sessionId}");
      return;
    }
    cb(true);
  },
});

wss.on("connection", (ws, req) => {
  const sessionId = parseSessionId(req.url);

  // Per-connection state, populated after the join handshake.
  let deviceId = null;
  let deviceName = null;
  let joined = false;

  // Ping/pong liveness tracking.
  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      sendError(ws, "Invalid JSON");
      return;
    }

    if (typeof msg.type !== "string") {
      sendError(ws, "Missing message type");
      return;
    }

    // ------------------------------------------------------------------
    // JOIN handshake (must be the first message)
    // ------------------------------------------------------------------
    if (!joined) {
      if (msg.type !== "join") {
        sendError(ws, "First message must be type:join");
        ws.close(4001, "Must join first");
        return;
      }

      deviceId = String(msg.deviceId || "anonymous");
      deviceName = String(msg.deviceName || deviceId);

      // Ensure room exists; cancel any pending cleanup.
      if (!rooms.has(sessionId)) {
        rooms.set(sessionId, new Map());
        console.log(`[${ts()}] room "${sessionId}" created`);
      }
      cancelRoomCleanup(sessionId);

      const room = rooms.get(sessionId);

      // If a device with the same ID is already connected, close the old socket.
      const existing = room.get(deviceId);
      if (existing) {
        console.log(`[${ts()}] replacing existing connection for device="${deviceId}" in session="${sessionId}"`);
        existing.ws.close(4002, "Replaced by new connection");
        room.delete(deviceId);
      }

      /** @type {Peer} */
      const peer = {
        ws,
        deviceId,
        deviceName,
        tokens: RATE_LIMIT_PER_SEC,
        lastRefill: Date.now(),
        alive: true,
      };
      room.set(deviceId, peer);
      joined = true;

      const count = peerCount(sessionId);
      console.log(`[${ts()}] +join  session="${sessionId}" device="${deviceId}" name="${deviceName}" peers=${count}`);

      // Build current peer list (excluding self) for the join confirmation.
      const peerList = [];
      for (const [id, p] of room) {
        if (id !== deviceId) {
          peerList.push({ deviceId: id, deviceName: p.deviceName });
        }
      }

      // Confirm join to the new client.
      ws.send(JSON.stringify({
        type: "joined",
        sessionId,
        deviceId,
        peerCount: count,
        peers: peerList,
      }));

      // Notify existing peers about the new arrival.
      broadcast(sessionId, deviceId, {
        type: "peer-joined",
        fromDeviceId: deviceId,
        deviceName,
        peerCount: count,
      });

      return;
    }

    // ------------------------------------------------------------------
    // Post-join: rate limit check
    // ------------------------------------------------------------------
    const room = rooms.get(sessionId);
    const peer = room ? room.get(deviceId) : null;
    if (!peer) return;

    if (!rateLimitAllow(peer)) {
      sendError(ws, "Rate limit exceeded (max 10 msg/sec)");
      return;
    }

    // ------------------------------------------------------------------
    // DELTA -- relay VFS change to peers
    // ------------------------------------------------------------------
    if (msg.type === "delta") {
      broadcast(sessionId, deviceId, {
        type: "delta",
        fromDeviceId: deviceId,
        delta: msg.delta,
      });
      return;
    }

    // ------------------------------------------------------------------
    // FULL-SYNC-REQUEST -- new device wants overlay from a peer
    // ------------------------------------------------------------------
    if (msg.type === "full-sync-request") {
      broadcast(sessionId, deviceId, {
        type: "full-sync-request",
        fromDeviceId: deviceId,
      });
      return;
    }

    // ------------------------------------------------------------------
    // FULL-SYNC-RESPONSE -- peer provides its overlay tar
    // ------------------------------------------------------------------
    if (msg.type === "full-sync-response") {
      broadcast(sessionId, deviceId, {
        type: "full-sync-response",
        fromDeviceId: deviceId,
        overlayTar: msg.overlayTar,
      });
      return;
    }

    // ------------------------------------------------------------------
    // CURSOR -- relay editing position / selection
    // ------------------------------------------------------------------
    if (msg.type === "cursor") {
      broadcast(sessionId, deviceId, {
        type: "cursor",
        fromDeviceId: deviceId,
        cursor: msg.cursor,
      });
      return;
    }

    sendError(ws, `Unknown message type: ${msg.type}`);
  });

  // ------------------------------------------------------------------
  // Disconnect handling
  // ------------------------------------------------------------------
  ws.on("close", () => {
    if (!joined) return;

    const room = rooms.get(sessionId);
    if (room) {
      room.delete(deviceId);
      const count = peerCount(sessionId);
      console.log(`[${ts()}] -left  session="${sessionId}" device="${deviceId}" peers=${count}`);

      broadcast(sessionId, deviceId, {
        type: "peer-left",
        fromDeviceId: deviceId,
        deviceName,
        peerCount: count,
      });

      if (room.size === 0) {
        scheduleRoomCleanup(sessionId);
      }
    }
  });

  ws.on("error", (err) => {
    console.error(`[${ts()}] ws error session="${sessionId}" device="${deviceId}":`, err.message);
  });
});

// ---------------------------------------------------------------------------
// Heartbeat: ping every client, terminate unresponsive ones
// ---------------------------------------------------------------------------

const pingInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log(`[${ts()}] ping timeout, terminating client`);
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, PING_INTERVAL_MS);

// Allow clean shutdown without the interval keeping the process alive.
pingInterval.unref();

wss.on("close", () => {
  clearInterval(pingInterval);
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

httpServer.listen(PORT, () => {
  console.log(`[${ts()}] friscy-sync-server listening on port ${PORT}`);
  console.log(`[${ts()}] health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown.
process.on("SIGINT", () => {
  console.log(`\n[${ts()}] shutting down...`);
  wss.close();
  httpServer.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log(`[${ts()}] shutting down...`);
  wss.close();
  httpServer.close();
  process.exit(0);
});
