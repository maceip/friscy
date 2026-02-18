/**
 * sync-client.js -- Browser ES module for cross-device VFS synchronization.
 *
 * Connects to a friscy-sync-server WebSocket relay, joins a session room,
 * and exchanges delta / full-sync / cursor messages with peers.
 *
 * Usage:
 *   import { SyncClient } from './sync-client.js';
 *
 *   const sync = new SyncClient('ws://localhost:4567', 'my-session');
 *   sync.addEventListener('delta-received', (e) => applyDelta(e.detail.delta));
 *   sync.addEventListener('full-sync-received', (e) => loadTar(e.detail.overlayTar));
 *   sync.addEventListener('full-sync-requested', () => sync.sendFullSync(exportTar()));
 *   sync.connect();
 */

// ---------------------------------------------------------------------------
// Fun random device name generator
// ---------------------------------------------------------------------------

const ADJECTIVES = [
  "Cosmic", "Neon", "Quantum", "Solar", "Lunar", "Stellar", "Crystal",
  "Thunder", "Velvet", "Amber", "Cobalt", "Crimson", "Golden", "Silver",
  "Jade", "Onyx", "Turbo", "Pixel", "Blazing", "Frozen", "Arctic",
  "Electric", "Nimble", "Silent", "Radiant", "Mystic", "Swift", "Atomic",
  "Coral", "Sapphire", "Ruby", "Bronze", "Phantom", "Frosted",
];

const ANIMALS = [
  "Penguin", "Tiger", "Fox", "Falcon", "Otter", "Panda", "Wolf", "Dolphin",
  "Eagle", "Lynx", "Hawk", "Bear", "Raven", "Cobra", "Jaguar", "Heron",
  "Gecko", "Bison", "Crane", "Shark", "Owl", "Moose", "Viper", "Parrot",
  "Koala", "Badger", "Lemur", "Ibis", "Quail", "Stork", "Phoenix",
  "Dragon", "Panther",
];

/**
 * Generate a fun random device name like "Cosmic Penguin" or "Neon Tiger".
 * @returns {string}
 */
function randomDeviceName() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return `${adj} ${animal}`;
}

/**
 * Generate a random 16-hex-character device ID using crypto.getRandomValues.
 * @returns {string}
 */
function randomDeviceId() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Get or create a value in localStorage, returning the fallback generator's
 * result if localStorage is unavailable or empty for that key.
 * @param {string} key
 * @param {() => string} generate
 * @returns {string}
 */
function persisted(key, generate) {
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const value = generate();
    localStorage.setItem(key, value);
    return value;
  } catch {
    // localStorage unavailable (private browsing, SSR, etc.)
    return generate();
  }
}

// ---------------------------------------------------------------------------
// Reconnect backoff constants
// ---------------------------------------------------------------------------

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
const BACKOFF_MULTIPLIER = 2;

// ---------------------------------------------------------------------------
// SyncClient
// ---------------------------------------------------------------------------

export class SyncClient extends EventTarget {
  /**
   * @param {string} serverUrl   WebSocket server origin, e.g. "ws://localhost:4567"
   * @param {string} sessionId   Shared session/room identifier
   * @param {string} [deviceId]  Unique device identifier (persisted to localStorage if omitted)
   * @param {string} [deviceName] Human-readable name (random adjective+animal if omitted)
   */
  constructor(serverUrl, sessionId, deviceId, deviceName) {
    super();

    this._serverUrl = serverUrl.replace(/\/+$/, "");
    this._sessionId = sessionId;
    this._deviceId = deviceId || persisted("friscy-sync-deviceId", randomDeviceId);
    this._deviceName = deviceName || persisted("friscy-sync-deviceName", randomDeviceName);

    /** @type {WebSocket|null} */
    this._ws = null;

    /** @type {boolean} Whether the join handshake completed successfully. */
    this._connected = false;

    /** @type {boolean} Whether disconnect() was called intentionally. */
    this._intentionalClose = false;

    /** @type {number} Current reconnect backoff delay in ms. */
    this._backoff = INITIAL_BACKOFF_MS;

    /** @type {ReturnType<typeof setTimeout>|null} */
    this._reconnectTimer = null;

    /** @type {number} Number of remote peers (excludes self). */
    this._peerCount = 0;

    /** @type {Map<string, {deviceId: string, deviceName: string}>} */
    this._peers = new Map();

    /** @type {Array<object>} Messages queued while disconnected. */
    this._queue = [];
  }

  // -----------------------------------------------------------------------
  // Public getters
  // -----------------------------------------------------------------------

  /** Whether the WebSocket is open and the join handshake has completed. */
  get connected() {
    return this._connected;
  }

  /** Number of remote peers in the session (excludes self). */
  get peerCount() {
    return this._peerCount;
  }

  /** Shallow copy of the peer map: deviceId -> { deviceId, deviceName }. */
  get peers() {
    return new Map(this._peers);
  }

  /** This client's device ID. */
  get deviceId() {
    return this._deviceId;
  }

  /** This client's device name. */
  get deviceName() {
    return this._deviceName;
  }

  /** The session ID this client is connected to. */
  get sessionId() {
    return this._sessionId;
  }

  // -----------------------------------------------------------------------
  // Connection lifecycle
  // -----------------------------------------------------------------------

  /**
   * Open the WebSocket connection and join the session.
   * Safe to call multiple times; redundant calls are ignored.
   */
  connect() {
    if (this._ws && (this._ws.readyState === WebSocket.CONNECTING || this._ws.readyState === WebSocket.OPEN)) {
      return; // already connecting or connected
    }

    this._intentionalClose = false;
    this._clearReconnectTimer();
    this._openSocket();
  }

  /**
   * Gracefully close the connection. Will NOT auto-reconnect.
   * Clears any pending reconnect timer and message queue.
   */
  disconnect() {
    this._intentionalClose = true;
    this._clearReconnectTimer();
    if (this._ws) {
      this._ws.close(1000, "Client disconnect");
      this._ws = null;
    }
    this._connected = false;
    this._peers.clear();
    this._peerCount = 0;
  }

  // -----------------------------------------------------------------------
  // Sending messages
  // -----------------------------------------------------------------------

  /**
   * Send a VFS delta to all peers.  Queued if disconnected.
   * @param {object} delta - Application-defined delta payload
   *   (e.g. { added: [...], modified: [...], deleted: [...] }).
   */
  sendDelta(delta) {
    this._sendOrQueue({ type: "delta", delta });
  }

  /**
   * Request a full VFS snapshot from peers.  Any peer may respond.
   * Queued if disconnected.
   */
  requestFullSync() {
    this._sendOrQueue({ type: "full-sync-request" });
  }

  /**
   * Send a full VFS snapshot (overlay tar) to peers, typically in response
   * to a full-sync-request event.  Queued if disconnected.
   * @param {string} overlayTar - Base64-encoded tar of the overlay filesystem.
   */
  sendFullSync(overlayTar) {
    this._sendOrQueue({ type: "full-sync-response", overlayTar });
  }

  /**
   * Broadcast cursor/selection state to peers.  NOT queued -- cursor updates
   * are ephemeral and only sent when connected.
   * @param {object} cursor - Application-defined cursor payload
   *   (e.g. { path: "/home/user/main.c", line: 42, col: 10 }).
   */
  sendCursor(cursor) {
    if (this._connected) {
      this._wsSend({ type: "cursor", cursor });
    }
  }

  // -----------------------------------------------------------------------
  // Internal: WebSocket management
  // -----------------------------------------------------------------------

  /** @private Open a new WebSocket and wire up event handlers. */
  _openSocket() {
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }

    const url = `${this._serverUrl}/session/${encodeURIComponent(this._sessionId)}`;
    this._ws = new WebSocket(url);

    this._ws.onopen = () => {
      // Reset backoff on successful TCP connection.
      this._backoff = INITIAL_BACKOFF_MS;

      // Send join handshake immediately.
      this._wsSend({
        type: "join",
        sessionId: this._sessionId,
        deviceId: this._deviceId,
        deviceName: this._deviceName,
      });
    };

    this._ws.onmessage = (event) => {
      this._handleMessage(event.data);
    };

    this._ws.onclose = (event) => {
      const wasConnected = this._connected;
      this._connected = false;
      this._peers.clear();
      this._peerCount = 0;

      if (wasConnected) {
        this._emit("disconnected", { code: event.code, reason: event.reason });
      }

      // Auto-reconnect unless the user called disconnect().
      if (!this._intentionalClose) {
        this._scheduleReconnect();
      }
    };

    this._ws.onerror = () => {
      this._emit("error", { message: "WebSocket connection error" });
      // onclose fires after onerror, which triggers reconnect.
    };
  }

  // -----------------------------------------------------------------------
  // Internal: message handling
  // -----------------------------------------------------------------------

  /**
   * Parse and dispatch an incoming server message.
   * @private
   * @param {string} raw
   */
  _handleMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      this._emit("error", { message: "Invalid JSON from server" });
      return;
    }

    switch (msg.type) {
      // Server confirmed our join.
      case "joined":
        this._connected = true;
        this._peerCount = Math.max(0, (msg.peerCount || 1) - 1); // exclude self
        this._peers.clear();
        if (Array.isArray(msg.peers)) {
          for (const p of msg.peers) {
            this._peers.set(p.deviceId, { deviceId: p.deviceId, deviceName: p.deviceName });
          }
        }
        this._emit("connected", {
          sessionId: msg.sessionId,
          deviceId: msg.deviceId,
          peerCount: this._peerCount,
          peers: Array.from(this._peers.values()),
        });
        // Flush any messages that were queued while disconnected.
        this._flushQueue();
        break;

      case "peer-joined":
        this._peerCount = Math.max(0, (msg.peerCount || 0) - 1);
        this._peers.set(msg.fromDeviceId, {
          deviceId: msg.fromDeviceId,
          deviceName: msg.deviceName,
        });
        this._emit("peer-joined", {
          deviceId: msg.fromDeviceId,
          deviceName: msg.deviceName,
          peerCount: this._peerCount,
        });
        break;

      case "peer-left":
        this._peerCount = Math.max(0, (msg.peerCount || 0) - 1);
        this._peers.delete(msg.fromDeviceId);
        this._emit("peer-left", {
          deviceId: msg.fromDeviceId,
          deviceName: msg.deviceName,
          peerCount: this._peerCount,
        });
        break;

      case "delta":
        this._emit("delta-received", {
          fromDeviceId: msg.fromDeviceId,
          delta: msg.delta,
        });
        break;

      case "full-sync-request":
        this._emit("full-sync-requested", {
          fromDeviceId: msg.fromDeviceId,
        });
        break;

      case "full-sync-response":
        this._emit("full-sync-received", {
          fromDeviceId: msg.fromDeviceId,
          overlayTar: msg.overlayTar,
        });
        break;

      case "cursor":
        this._emit("cursor-update", {
          fromDeviceId: msg.fromDeviceId,
          cursor: msg.cursor,
        });
        break;

      case "error":
        this._emit("error", { message: msg.message });
        break;

      default:
        // Unknown message type -- ignore silently.
        break;
    }
  }

  // -----------------------------------------------------------------------
  // Internal: reconnection with exponential backoff
  // -----------------------------------------------------------------------

  /** @private Schedule a reconnect attempt with exponential backoff (max 30s). */
  _scheduleReconnect() {
    this._clearReconnectTimer();
    const delay = this._backoff;
    // Exponential backoff: 1s -> 2s -> 4s -> 8s -> 16s -> 30s (capped).
    this._backoff = Math.min(MAX_BACKOFF_MS, this._backoff * BACKOFF_MULTIPLIER);
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this._openSocket();
    }, delay);
  }

  /** @private */
  _clearReconnectTimer() {
    if (this._reconnectTimer !== null) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  // -----------------------------------------------------------------------
  // Internal: message queue (buffer while disconnected, flush on reconnect)
  // -----------------------------------------------------------------------

  /**
   * Send immediately if connected, otherwise add to the queue.
   * @private
   * @param {object} msg
   */
  _sendOrQueue(msg) {
    if (this._connected) {
      this._wsSend(msg);
    } else {
      this._queue.push(msg);
    }
  }

  /** @private Drain the offline message queue. */
  _flushQueue() {
    while (this._queue.length > 0) {
      const msg = this._queue.shift();
      this._wsSend(msg);
    }
  }

  /**
   * Low-level WebSocket send (JSON serialization).
   * @private
   * @param {object} msg
   */
  _wsSend(msg) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(msg));
    }
  }

  // -----------------------------------------------------------------------
  // Internal: event emission
  // -----------------------------------------------------------------------

  /**
   * Emit a CustomEvent on this EventTarget.
   * @private
   * @param {string} type   Event name (e.g. "connected", "delta-received")
   * @param {object} detail Event detail payload
   */
  _emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}
