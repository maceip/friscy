// overlay.js - OPFS-based overlay persistence layer for friscy emulator
//
// Provides session management, VFS snapshot storage, auto-save, and
// diff-based delta compression using the Origin Private File System (OPFS).
//
// Usage:
//   import { createSession, listSessions, saveOverlay, loadOverlay,
//            startAutoSave, stopAutoSave, computeDelta, applyDelta,
//            requestExportFromWorker } from './overlay.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SESSIONS_DIR = 'friscy-sessions';
const OVERLAY_FILE = 'overlay.tar';
const META_FILE = 'meta.json';

// Command code for VFS export request (must match worker.js CMD constants).
// Worker handler for this command is documented at the end of this file.
const CMD_EXPORT_VFS = 8;

// Tar block size (always 512 bytes)
const TAR_BLOCK = 512;

// ---------------------------------------------------------------------------
// Minimal tar parser
// ---------------------------------------------------------------------------

/**
 * Decode a NUL-terminated ASCII string from a Uint8Array slice.
 * @param {Uint8Array} buf
 * @param {number} offset
 * @param {number} len
 * @returns {string}
 */
function tarString(buf, offset, len) {
    let end = offset;
    const limit = offset + len;
    while (end < limit && buf[end] !== 0) end++;
    return new TextDecoder('ascii').decode(buf.subarray(offset, end));
}

/**
 * Parse an octal number from a tar header field.
 * Handles both NUL-terminated octal strings and binary-encoded sizes
 * (high bit set in first byte).
 * @param {Uint8Array} buf
 * @param {number} offset
 * @param {number} len
 * @returns {number}
 */
function tarOctal(buf, offset, len) {
    // Binary encoding: high bit set in first byte
    if (buf[offset] & 0x80) {
        let val = 0;
        for (let i = offset + 1; i < offset + len; i++) {
            val = val * 256 + buf[i];
        }
        return val;
    }
    const s = tarString(buf, offset, len).trim();
    return s.length > 0 ? parseInt(s, 8) : 0;
}

/**
 * Encode a string as NUL-padded bytes into a buffer.
 */
function tarWriteString(buf, offset, len, str) {
    const bytes = new TextEncoder().encode(str);
    const writeLen = Math.min(bytes.length, len - 1);
    buf.set(bytes.subarray(0, writeLen), offset);
    // Remaining bytes are already 0 from Uint8Array default
}

/**
 * Encode a number as an octal string into a tar header field.
 */
function tarWriteOctal(buf, offset, len, val) {
    const s = val.toString(8);
    // Right-align, pad with leading zeros, leave room for NUL terminator
    const padded = s.padStart(len - 1, '0');
    tarWriteString(buf, offset, len, padded);
}

/**
 * Compute the tar header checksum (sum of all bytes, treating the
 * checksum field itself as spaces).
 */
function tarChecksum(header) {
    let sum = 0;
    for (let i = 0; i < TAR_BLOCK; i++) {
        // Checksum field is at bytes 148..155 (8 bytes), treated as spaces
        if (i >= 148 && i < 156) {
            sum += 0x20;
        } else {
            sum += header[i];
        }
    }
    return sum;
}

/**
 * @typedef {Object} TarEntry
 * @property {string} path    - File path from tar header
 * @property {number} size    - File size in bytes
 * @property {number} mtime   - Modification time (Unix seconds)
 * @property {number} mode    - File permission bits
 * @property {string} type    - '0' = regular file, '5' = directory, etc.
 * @property {number} offset  - Byte offset of the file DATA in the tar
 */

/**
 * Parse a tar buffer and return an array of entries.
 * Does not extract file contents; records byte offsets for on-demand access.
 *
 * @param {ArrayBuffer|Uint8Array} tar
 * @returns {TarEntry[]}
 */
export function parseTar(tar) {
    const buf = tar instanceof Uint8Array ? tar : new Uint8Array(tar);
    const entries = [];
    let pos = 0;

    while (pos + TAR_BLOCK <= buf.length) {
        // Check for end-of-archive marker (two consecutive zero blocks)
        let allZero = true;
        for (let i = 0; i < TAR_BLOCK; i++) {
            if (buf[pos + i] !== 0) { allZero = false; break; }
        }
        if (allZero) break;

        const path = tarString(buf, pos, 100);
        const mode = tarOctal(buf, pos + 100, 8);
        const size = tarOctal(buf, pos + 124, 12);
        const mtime = tarOctal(buf, pos + 136, 12);
        const type = tarString(buf, pos + 156, 1) || '0';

        // USTAR prefix (bytes 345..499)
        const prefix = tarString(buf, pos + 345, 155);
        const fullPath = prefix ? prefix + '/' + path : path;

        const dataOffset = pos + TAR_BLOCK;

        entries.push({ path: fullPath, size, mtime, mode, type, offset: dataOffset });

        // Advance past header + data blocks (data is padded to 512-byte boundary)
        const dataBlocks = Math.ceil(size / TAR_BLOCK);
        pos += TAR_BLOCK + dataBlocks * TAR_BLOCK;
    }

    return entries;
}

/**
 * Extract the raw content of a specific entry from a tar buffer.
 *
 * @param {ArrayBuffer|Uint8Array} tar
 * @param {TarEntry} entry
 * @returns {Uint8Array}
 */
export function extractEntry(tar, entry) {
    const buf = tar instanceof Uint8Array ? tar : new Uint8Array(tar);
    return buf.slice(entry.offset, entry.offset + entry.size);
}

/**
 * Create a tar archive from an array of file descriptors.
 *
 * @param {Array<{path: string, content: Uint8Array, mode?: number, mtime?: number}>} files
 * @returns {Uint8Array}
 */
export function createTar(files) {
    // Calculate total size
    let totalSize = 0;
    for (const f of files) {
        totalSize += TAR_BLOCK; // header
        totalSize += Math.ceil(f.content.length / TAR_BLOCK) * TAR_BLOCK; // data
    }
    totalSize += TAR_BLOCK * 2; // end-of-archive marker (two zero blocks)

    const out = new Uint8Array(totalSize);
    let pos = 0;

    for (const f of files) {
        const header = out.subarray(pos, pos + TAR_BLOCK);

        // File path: if longer than 100 chars, split into prefix + name
        let name = f.path;
        let prefix = '';
        if (name.length > 100) {
            const slashIdx = name.lastIndexOf('/', 155);
            if (slashIdx > 0) {
                prefix = name.substring(0, slashIdx);
                name = name.substring(slashIdx + 1);
            }
        }

        tarWriteString(header, 0, 100, name);
        tarWriteOctal(header, 100, 8, f.mode ?? 0o644);
        tarWriteOctal(header, 108, 8, 0);    // uid
        tarWriteOctal(header, 116, 8, 0);    // gid
        tarWriteOctal(header, 124, 12, f.content.length); // size
        tarWriteOctal(header, 136, 12, f.mtime ?? Math.floor(Date.now() / 1000)); // mtime
        header[156] = 0x30; // type '0' = regular file

        // USTAR magic
        tarWriteString(header, 257, 6, 'ustar');
        header[263] = 0x20; // version space
        header[264] = 0x20;

        if (prefix) {
            tarWriteString(header, 345, 155, prefix);
        }

        // Compute and write checksum
        const cksum = tarChecksum(header);
        tarWriteOctal(header, 148, 7, cksum);
        header[155] = 0x20; // checksum terminator is space

        pos += TAR_BLOCK;

        // Write file data
        out.set(f.content, pos);
        pos += Math.ceil(f.content.length / TAR_BLOCK) * TAR_BLOCK;
    }

    // Two zero blocks already present (Uint8Array is zero-initialized)
    return out;
}

// ---------------------------------------------------------------------------
// OPFS helpers
// ---------------------------------------------------------------------------

/**
 * Get or create the root sessions directory in OPFS.
 * @returns {Promise<FileSystemDirectoryHandle>}
 */
async function getSessionsRoot() {
    const root = await navigator.storage.getDirectory();
    return root.getDirectoryHandle(SESSIONS_DIR, { create: true });
}

/**
 * Get a session's directory handle, optionally creating it.
 * @param {string} sessionId
 * @param {boolean} create
 * @returns {Promise<FileSystemDirectoryHandle>}
 */
async function getSessionDir(sessionId, create = false) {
    const sessionsRoot = await getSessionsRoot();
    return sessionsRoot.getDirectoryHandle(sessionId, { create });
}

/**
 * Read a file from OPFS as an ArrayBuffer.
 * Returns null if the file does not exist.
 */
async function opfsReadFile(dirHandle, filename) {
    try {
        const fileHandle = await dirHandle.getFileHandle(filename);
        const file = await fileHandle.getFile();
        return await file.arrayBuffer();
    } catch (e) {
        if (e.name === 'NotFoundError') return null;
        throw e;
    }
}

/**
 * Write an ArrayBuffer (or Uint8Array) to an OPFS file.
 */
async function opfsWriteFile(dirHandle, filename, data) {
    const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(data);
    await writable.close();
}

/**
 * Read and parse a JSON file from OPFS. Returns null if not found.
 */
async function opfsReadJSON(dirHandle, filename) {
    const buf = await opfsReadFile(dirHandle, filename);
    if (!buf) return null;
    const text = new TextDecoder().decode(buf);
    return JSON.parse(text);
}

/**
 * Write a JSON-serializable object to an OPFS file.
 */
async function opfsWriteJSON(dirHandle, filename, obj) {
    const text = JSON.stringify(obj, null, 2);
    await opfsWriteFile(dirHandle, filename, new TextEncoder().encode(text));
}

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

/**
 * Generate a UUID v4 string.
 * Uses crypto.randomUUID() if available, otherwise falls back to manual generation.
 * @returns {string}
 */
function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Fallback: manual UUID v4
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * @typedef {Object} SessionMeta
 * @property {string}  sessionId    - Unique session identifier
 * @property {string}  name         - Human-readable session name
 * @property {number}  createdAt    - Unix timestamp (ms) when session was created
 * @property {number}  lastModified - Unix timestamp (ms) of last overlay save
 * @property {number}  overlaySize  - Size of the stored overlay in bytes (0 if none)
 */

/**
 * Create or open a session. If no sessionId is given, a new UUID is generated.
 * If the session already exists, its metadata is returned as-is.
 *
 * @param {string} [sessionId] - Optional session identifier
 * @param {string} [name]      - Optional human-readable name
 * @returns {Promise<SessionMeta>}
 */
export async function createSession(sessionId, name) {
    const id = sessionId || generateUUID();
    const dir = await getSessionDir(id, true);

    // Check if meta already exists (session already created)
    const existing = await opfsReadJSON(dir, META_FILE);
    if (existing) return existing;

    const now = Date.now();
    /** @type {SessionMeta} */
    const meta = {
        sessionId: id,
        name: name || `Session ${id.slice(0, 8)}`,
        createdAt: now,
        lastModified: now,
        overlaySize: 0,
    };

    await opfsWriteJSON(dir, META_FILE, meta);
    return meta;
}

/**
 * List all saved sessions with their metadata.
 *
 * @returns {Promise<SessionMeta[]>}
 */
export async function listSessions() {
    const sessionsRoot = await getSessionsRoot();
    const sessions = [];

    for await (const [name, handle] of sessionsRoot) {
        if (handle.kind !== 'directory') continue;
        try {
            const meta = await opfsReadJSON(handle, META_FILE);
            if (meta) sessions.push(meta);
        } catch (e) {
            // Corrupted or incomplete session directory; skip it
            console.warn(`[overlay] Skipping corrupted session "${name}":`, e.message);
        }
    }

    // Sort by lastModified descending (most recent first)
    sessions.sort((a, b) => b.lastModified - a.lastModified);
    return sessions;
}

/**
 * Delete a session and all its stored data from OPFS.
 *
 * @param {string} sessionId
 * @returns {Promise<void>}
 */
export async function deleteSession(sessionId) {
    const sessionsRoot = await getSessionsRoot();
    try {
        await sessionsRoot.removeEntry(sessionId, { recursive: true });
    } catch (e) {
        if (e.name === 'NotFoundError') return; // Already gone
        throw e;
    }
}

// ---------------------------------------------------------------------------
// Overlay storage
// ---------------------------------------------------------------------------

/**
 * Save a tar blob (from friscy_export_tar) to OPFS for a given session.
 * Updates the session metadata with the new lastModified time and size.
 *
 * @param {string} sessionId
 * @param {ArrayBuffer|Uint8Array} tarBlob
 * @returns {Promise<SessionMeta>}
 */
export async function saveOverlay(sessionId, tarBlob) {
    const dir = await getSessionDir(sessionId, true);
    const data = tarBlob instanceof Uint8Array ? tarBlob : new Uint8Array(tarBlob);

    await opfsWriteFile(dir, OVERLAY_FILE, data);

    // Update metadata
    const meta = await opfsReadJSON(dir, META_FILE) || {
        sessionId,
        name: `Session ${sessionId.slice(0, 8)}`,
        createdAt: Date.now(),
    };
    meta.lastModified = Date.now();
    meta.overlaySize = data.byteLength;
    await opfsWriteJSON(dir, META_FILE, meta);

    return meta;
}

/**
 * Load the overlay tar blob for a given session.
 * Returns null if no overlay has been saved yet.
 *
 * @param {string} sessionId
 * @returns {Promise<ArrayBuffer|null>}
 */
export async function loadOverlay(sessionId) {
    try {
        const dir = await getSessionDir(sessionId, false);
        return await opfsReadFile(dir, OVERLAY_FILE);
    } catch (e) {
        if (e.name === 'NotFoundError') return null;
        throw e;
    }
}

/**
 * Get the stored overlay size in bytes for a session.
 * Returns 0 if no overlay exists.
 *
 * @param {string} sessionId
 * @returns {Promise<number>}
 */
export async function getOverlaySize(sessionId) {
    try {
        const dir = await getSessionDir(sessionId, false);
        const fileHandle = await dir.getFileHandle(OVERLAY_FILE);
        const file = await fileHandle.getFile();
        return file.size;
    } catch (e) {
        if (e.name === 'NotFoundError') return 0;
        throw e;
    }
}

// ---------------------------------------------------------------------------
// Auto-save timer
// ---------------------------------------------------------------------------

/**
 * EventTarget for auto-save lifecycle events.
 * Emits: 'save-start', 'save-complete', 'save-error'
 */
export const autoSaveEvents = new EventTarget();

let _autoSaveTimer = null;
let _autoSaveBusy = false;

/**
 * Start the auto-save timer. Periodically calls getExportFn() to obtain
 * the current VFS tar blob and saves it to the session's overlay in OPFS.
 *
 * If a save is already in progress when the timer fires, that interval is
 * skipped (debounce).
 *
 * @param {string} sessionId       - Session to save into
 * @param {() => Promise<ArrayBuffer>} getExportFn - Async function returning VFS tar blob
 * @param {number} [intervalMs=5000] - Save interval in milliseconds
 */
export function startAutoSave(sessionId, getExportFn, intervalMs = 5000) {
    stopAutoSave(); // Clear any existing timer

    _autoSaveTimer = setInterval(async () => {
        if (_autoSaveBusy) {
            // Previous save still in progress; skip this interval
            return;
        }
        _autoSaveBusy = true;
        autoSaveEvents.dispatchEvent(new CustomEvent('save-start', {
            detail: { sessionId, timestamp: Date.now() },
        }));

        try {
            const tarBlob = await getExportFn();
            if (!tarBlob || tarBlob.byteLength === 0) {
                _autoSaveBusy = false;
                return;
            }
            const meta = await saveOverlay(sessionId, tarBlob);
            autoSaveEvents.dispatchEvent(new CustomEvent('save-complete', {
                detail: { sessionId, meta, timestamp: Date.now() },
            }));
        } catch (e) {
            console.error('[overlay] Auto-save error:', e.message);
            autoSaveEvents.dispatchEvent(new CustomEvent('save-error', {
                detail: { sessionId, error: e, timestamp: Date.now() },
            }));
        } finally {
            _autoSaveBusy = false;
        }
    }, intervalMs);
}

/**
 * Stop the auto-save timer.
 */
export function stopAutoSave() {
    if (_autoSaveTimer !== null) {
        clearInterval(_autoSaveTimer);
        _autoSaveTimer = null;
    }
    _autoSaveBusy = false;
}

// ---------------------------------------------------------------------------
// Diff-based overlay (delta compression)
// ---------------------------------------------------------------------------

/**
 * Build a lookup map from tar entries: path -> { size, mtime, offset }.
 * Used for fast comparison between two tar archives.
 *
 * @param {TarEntry[]} entries
 * @returns {Map<string, TarEntry>}
 */
function buildEntryMap(entries) {
    const map = new Map();
    for (const e of entries) {
        map.set(e.path, e);
    }
    return map;
}

/**
 * Encode a Uint8Array as a base64 string.
 * Uses the built-in btoa where available.
 *
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function toBase64(bytes) {
    // Build a binary string in chunks to avoid call stack overflow
    const CHUNK = 8192;
    let binary = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
        const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
        binary += String.fromCharCode.apply(null, slice);
    }
    return btoa(binary);
}

/**
 * Decode a base64 string to a Uint8Array.
 *
 * @param {string} b64
 * @returns {Uint8Array}
 */
function fromBase64(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

/**
 * @typedef {Object} DeltaEntry
 * @property {string} path        - File path
 * @property {string} data        - Base64-encoded file content
 * @property {number} [mode]      - Permission bits
 * @property {number} [mtime]     - Modification time
 */

/**
 * @typedef {Object} Delta
 * @property {DeltaEntry[]}  added    - Files present in current but not in base
 * @property {DeltaEntry[]}  modified - Files present in both but changed (size or mtime differ)
 * @property {string[]}      deleted  - Paths present in base but not in current
 */

/**
 * Compute a delta between a base tar (original rootfs) and the current VFS tar.
 * Only files that were added, modified, or deleted are included.
 *
 * Comparison is by path + size + mtime. Files with identical path, size, and
 * mtime are considered unchanged and excluded from the delta.
 *
 * @param {ArrayBuffer|Uint8Array} baseTar    - Original rootfs tar
 * @param {ArrayBuffer|Uint8Array} currentTar - Current VFS tar (from friscy_export_tar)
 * @returns {Delta}
 */
export function computeDelta(baseTar, currentTar) {
    const baseBuf = baseTar instanceof Uint8Array ? baseTar : new Uint8Array(baseTar);
    const currBuf = currentTar instanceof Uint8Array ? currentTar : new Uint8Array(currentTar);

    const baseEntries = parseTar(baseBuf);
    const currEntries = parseTar(currBuf);

    const baseMap = buildEntryMap(baseEntries);
    const currMap = buildEntryMap(currEntries);

    /** @type {Delta} */
    const delta = { added: [], modified: [], deleted: [] };

    // Find added and modified files
    for (const curr of currEntries) {
        // Skip directories (type '5') -- we only track files
        if (curr.type === '5') continue;

        const base = baseMap.get(curr.path);
        if (!base) {
            // Added: not in base tar
            delta.added.push({
                path: curr.path,
                data: toBase64(extractEntry(currBuf, curr)),
                mode: curr.mode,
                mtime: curr.mtime,
            });
        } else if (base.size !== curr.size || base.mtime !== curr.mtime) {
            // Modified: size or mtime changed
            delta.modified.push({
                path: curr.path,
                data: toBase64(extractEntry(currBuf, curr)),
                mode: curr.mode,
                mtime: curr.mtime,
            });
        }
        // else: unchanged, skip
    }

    // Find deleted files
    for (const base of baseEntries) {
        if (base.type === '5') continue;
        if (!currMap.has(base.path)) {
            delta.deleted.push(base.path);
        }
    }

    return delta;
}

/**
 * Apply a delta to a base tar to reconstruct the full VFS tar.
 *
 * 1. Start with all base tar files not in delta.deleted
 * 2. Replace modified files with delta versions
 * 3. Append added files
 *
 * @param {ArrayBuffer|Uint8Array} baseTar - Original rootfs tar
 * @param {Delta} delta                    - Delta to apply
 * @returns {Uint8Array} - Reconstructed full tar
 */
export function applyDelta(baseTar, delta) {
    const baseBuf = baseTar instanceof Uint8Array ? baseTar : new Uint8Array(baseTar);
    const baseEntries = parseTar(baseBuf);

    const deletedSet = new Set(delta.deleted);
    const modifiedMap = new Map();
    for (const m of delta.modified) {
        modifiedMap.set(m.path, m);
    }

    const outputFiles = [];

    // Process base entries: keep unchanged, replace modified, skip deleted
    for (const entry of baseEntries) {
        if (deletedSet.has(entry.path)) continue;

        const mod = modifiedMap.get(entry.path);
        if (mod) {
            outputFiles.push({
                path: mod.path,
                content: fromBase64(mod.data),
                mode: mod.mode ?? entry.mode,
                mtime: mod.mtime ?? entry.mtime,
            });
        } else {
            outputFiles.push({
                path: entry.path,
                content: extractEntry(baseBuf, entry),
                mode: entry.mode,
                mtime: entry.mtime,
            });
        }
    }

    // Append added files
    for (const added of delta.added) {
        outputFiles.push({
            path: added.path,
            content: fromBase64(added.data),
            mode: added.mode ?? 0o644,
            mtime: added.mtime ?? Math.floor(Date.now() / 1000),
        });
    }

    return createTar(outputFiles);
}

// ---------------------------------------------------------------------------
// Integration helpers
// ---------------------------------------------------------------------------

/**
 * Request a VFS export from the worker by sending CMD_EXPORT_VFS.
 *
 * The worker receives this command, calls _friscy_export_tar() to snapshot
 * the VFS, and sends the tar blob back via postMessage.
 *
 * Returns a Promise that resolves to the tar ArrayBuffer.
 *
 * @param {Worker} worker        - The Web Worker running the emulator
 * @param {Int32Array} controlView  - Int32Array view of the control SharedArrayBuffer
 * @param {Uint8Array} controlBytes - Uint8Array view of the control SharedArrayBuffer
 * @returns {Promise<ArrayBuffer>}
 */
export function requestExportFromWorker(worker, controlView, _controlBytes) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            worker.removeEventListener('message', handler);
            reject(new Error('VFS export timed out after 30 seconds'));
        }, 30000);

        function handler(e) {
            if (e.data && e.data.type === 'vfs_export') {
                clearTimeout(timeout);
                worker.removeEventListener('message', handler);
                resolve(e.data.tarData);
            } else if (e.data && e.data.type === 'vfs_export_error') {
                clearTimeout(timeout);
                worker.removeEventListener('message', handler);
                reject(new Error(e.data.message || 'VFS export failed'));
            }
        }

        worker.addEventListener('message', handler);

        // Signal the worker to perform the export.
        // We use CMD_EXPORT_VFS (8) in the command slot and notify.
        Atomics.store(controlView, 0, CMD_EXPORT_VFS);
        Atomics.notify(controlView, 0);
    });
}

// ---------------------------------------------------------------------------
// Worker-side handler documentation
// ---------------------------------------------------------------------------

/*
 * To integrate CMD_EXPORT_VFS in worker.js, add the following:
 *
 * 1. Define the constant at the top alongside existing CMD_* values:
 *
 *    const CMD_EXPORT_VFS = 8;
 *
 * 2. In the resume loop (runResumeLoop), check for the export command
 *    before or after the stdin handling block:
 *
 *    const cmd = Atomics.load(controlView, 0);
 *    if (cmd === CMD_EXPORT_VFS) {
 *        Atomics.store(controlView, 0, CMD_IDLE);
 *        try {
 *            // Allocate space for the output size pointer (4 bytes)
 *            const sizePtr = emModule._malloc(4);
 *            const dataPtr = emModule._friscy_export_tar(sizePtr);
 *            const size = emModule.HEAPU32[sizePtr >> 2];
 *            emModule._free(sizePtr);
 *
 *            if (dataPtr && size > 0) {
 *                // Copy tar data out of Wasm heap (it may be freed later)
 *                const tarData = emModule.HEAPU8.slice(dataPtr, dataPtr + size);
 *                emModule._free(dataPtr);
 *                // Send to main thread via postMessage (transferable)
 *                const buf = tarData.buffer;
 *                self.postMessage({ type: 'vfs_export', tarData: buf }, [buf]);
 *            } else {
 *                self.postMessage({ type: 'vfs_export_error', message: 'Empty export' });
 *            }
 *        } catch (e) {
 *            self.postMessage({ type: 'vfs_export_error', message: e.message });
 *        }
 *    }
 *
 * 3. The main thread calls requestExportFromWorker() from overlay.js,
 *    which sets CMD_EXPORT_VFS in the control SAB and listens for the
 *    'vfs_export' postMessage response.
 */
