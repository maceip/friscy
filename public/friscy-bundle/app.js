import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { SearchAddon } from '@xterm/addon-search';
import { ImageAddon } from '@xterm/addon-image';

// WebTransport bridge removed — VectorHeart hypercalls handle networking via JSPI
// Go proxy server code retained in repo for reference

const FRISCY_THEME = {
    background: '#0a0e14',
    foreground: '#e6e1cf',
    selectionBackground: '#1d3b53',
    selectionForeground: '#e6e1cf',
    selectionInactiveBackground: '#14222e',
    cursor: '#ff8f40',
    cursorAccent: '#0a0e14',
    black: '#1c2433',
    red: '#ff3333',
    green: '#c2d94c',
    yellow: '#ff8f40',
    blue: '#59c2ff',
    magenta: '#d2a6ff',
    cyan: '#73d0ff',
    white: '#c7c7c7',
    brightBlack: '#3e4b59',
    brightRed: '#ff6666',
    brightGreen: '#bae67e',
    brightYellow: '#ffb454',
    brightBlue: '#73b8ff',
    brightMagenta: '#dfbfff',
    brightCyan: '#95e6cb',
    brightWhite: '#f0f0f0',
};

const LIGHT_THEME = {
    background: '#f0f0f0',
    foreground: '#333333',
    selectionBackground: '#d0d0d0',
    selectionForeground: '#333333',
    cursor: '#ff8f40',
    cursorAccent: '#ffffff',
    black: '#333333',
    red: '#d9534f',
    green: '#5cb85c',
    yellow: '#f0ad4e',
    blue: '#428bca',
    magenta: '#d9534f',
    cyan: '#5bc0de',
    white: '#cccccc',
    brightBlack: '#666666',
    brightRed: '#d9534f',
    brightGreen: '#5cb85c',
    brightYellow: '#f0ad4e',
    brightBlue: '#428bca',
    brightMagenta: '#d9534f',
    brightCyan: '#5bc0de',
    brightWhite: '#ffffff',
};

// ── Command History (persisted to localStorage) ──
const HISTORY_KEY = 'friscy-cmd-history';
const HISTORY_MAX = 500;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const cmdHistory = {
    _entries: JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'),
    _pos: -1,
    push(cmd) {
        if (!cmd.trim()) return;
        // Dedupe consecutive
        if (this._entries[this._entries.length - 1] === cmd) return;
        this._entries.push(cmd);
        if (this._entries.length > HISTORY_MAX) this._entries.shift();
        this._pos = -1;
        try { localStorage.setItem(HISTORY_KEY, JSON.stringify(this._entries)); } catch (_e) {
            // Suppress
        }
    },
    up() {
        if (this._entries.length === 0) return undefined;
        if (this._pos < 0) this._pos = this._entries.length;
        this._pos = Math.max(0, this._pos - 1);
        return this._entries[this._pos];
    },
    down() {
        if (this._pos < 0) return '';
        this._pos = Math.min(this._entries.length, this._pos + 1);
        return this._pos < this._entries.length ? this._entries[this._pos] : '';
    },
    reset() { this._pos = -1; },
};

// ── Drag & Drop image handler ──
function setupDragDrop(terminalEl, term) {
    const imageSidePanel = document.getElementById('image-side-panel');
    const droppedImagePreview = document.getElementById('dropped-image-preview');
    const imageSidePanelClose = document.getElementById('image-side-panel-close');

    if (imageSidePanelClose) {
        imageSidePanelClose.addEventListener('click', () => {
            imageSidePanel?.classList.remove('open');
            if (droppedImagePreview) (droppedImagePreview as HTMLImageElement).src = ''; 
        });
    }

    terminalEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        terminalEl.style.outline = '2px solid #ff8f40';
        terminalEl.style.outlineOffset = '-2px';
    });
    terminalEl.addEventListener('dragleave', () => {
        terminalEl.style.outline = '';
    });
    terminalEl.addEventListener('drop', (e) => {
        e.preventDefault();
        terminalEl.style.outline = '';
        const files = Array.from(e.dataTransfer.files);
        for (const file of files) {
            if (!file.type.startsWith('image/')) {
                term.writeln(`
\x1b[33m[drop] Skipping non-image: ${file.name}\x1b[0m`);
                continue;
            }
            const reader = new FileReader();
            reader.onload = (event) => {
                const dataURL = event.target?.result as string;
                const b64 = dataURL.split(',')[1];
                // iTerm2 inline image protocol (supported by xterm-addon-image)
                const params = `name=${btoa(file.name)};size=${file.size};inline=1`;
                term.write(`\x1b]1337;File=${params}:${b64}\x07`);
                term.writeln(`
\x1b[36m[drop] ${file.name} (${(file.size/1024).toFixed(1)}KB)\x1b[0m`);

                // Display image in side panel
                if (droppedImagePreview) (droppedImagePreview as HTMLImageElement).src = dataURL;
                imageSidePanel?.classList.add('open');
            };
            reader.readAsDataURL(file);
        }
    });
}

// ── Clipboard paste handler (Ctrl+V / Cmd+V) ──
function setupClipboard(term) {
    term.attachCustomKeyEventHandler((e) => {
        // Ctrl+C: copy selection if any, otherwise send SIGINT
        if (e.ctrlKey && e.key === 'c' && e.type === 'keydown') {
            const sel = term.getSelection();
            if (sel) {
                navigator.clipboard.writeText(sel).catch(() => {});
                term.clearSelection();
                return false; // prevent sending to guest
            }
            return true; // send ^C to guest
        }
        // Ctrl+V / Cmd+V: paste
        if ((e.ctrlKey || e.metaKey) && e.key === 'v' && e.type === 'keydown') {
            navigator.clipboard.readText().then(text => {
                if (text) term.paste(text);
            }).catch(() => {});
            return false;
        }
        return true;
    });
}

const statusEl = document.getElementById('status');
const netStatusEl = document.getElementById('net-status');
const terminalEl = document.getElementById('terminal');

let term, fitAddon;
let worker: Worker | null = null;
// WebTransport bridge removed — VH hypercalls handle networking
let machineRunning = false;

// SharedArrayBuffers for Worker communication
let controlSab: SharedArrayBuffer | null = null;
let stdoutSab: SharedArrayBuffer | null = null;
let netSab: SharedArrayBuffer | null = null;
let controlView: Int32Array | null = null;
let stdoutView: Int32Array | null = null;
let stdoutBytes: Uint8Array | null = null;

const RING_HEADER = 8;
const RING_SIZE = 65528;
const CMD_IDLE = 0;
const CMD_STDIN_REQUEST = 2;
const CMD_STDIN_READY = 3;
const CMD_EXIT = 4;

// Pending stdin bytes from terminal input
const stdinQueue: number[] = [];

// Companion instance (dual terminal for server tab)
let term2 = null, fitAddon2 = null, worker2 = null;
const machineRunning2 = false;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let controlSab2 = null, stdoutSab2 = null, netSab2 = null, controlView2 = null, stdoutView2 = null, stdoutBytes2 = null;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const stdinQueue2: number[] = [];

// Expose for testing (Puppeteer)
(window as any)._friscyStdinQueue = stdinQueue;
(window as any).__friscyJitStats = null;

const jitWarmupHudEl = document.getElementById('jit-warmup-hud');
const jitHudCompiledEl = document.getElementById('jit-hud-compiled');
const jitHudQueueEl = document.getElementById('jit-hud-queue');
const jitHudMissEl = document.getElementById('jit-hud-miss');
const jitHudPredictEl = document.getElementById('jit-hud-predict');
let jitHudEnabled = true;
let latestJitStats = null;

function formatPercent(value) {
    if (!Number.isFinite(value)) return '0.0%';
    return `${(value * 100).toFixed(1)}%`;
}

function updateJitWarmupHud(stats) {
    if (!jitWarmupHudEl) return;
    if (!jitHudEnabled || !stats) {
        jitWarmupHudEl.classList.remove('visible');
        return;
    }
    const compiled = Number.isFinite(stats.compiledRegionCount) ? stats.compiledRegionCount : 0;
    const queueDepth = Number.isFinite(stats.queueDepth) ? stats.queueDepth : 0;
    const missRate = Number.isFinite(stats.missRate)
        ? stats.missRate
        : (Number.isFinite(stats.regionMisses) && Number.isFinite(stats.dispatchCalls) && stats.dispatchCalls > 0
            ? stats.regionMisses / stats.dispatchCalls
            : 0);
    const predictorHitRate = Number.isFinite(stats.predictorHitRate) ? stats.predictorHitRate : 0;
    if (jitHudCompiledEl) jitHudCompiledEl.textContent = String(compiled);
    if (jitHudQueueEl) jitHudQueueEl.textContent = String(queueDepth);
    if (jitHudMissEl) jitHudMissEl.textContent = formatPercent(missRate);
    if (jitHudPredictEl) jitHudPredictEl.textContent = formatPercent(predictorHitRate);
    jitWarmupHudEl.classList.add('visible');
}

function handleWorkerRuntimeMessage(e) {
    const msg = e && e.data ? e.data : null;
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'error') {
        console.error('[main] Worker runtime error:', msg.message);
        if (statusEl) statusEl.textContent = `Error: ${msg.message}`;
        return;
    }
    if (msg.type === 'jit_stats') {
        latestJitStats = msg.stats || null;
        (window as any).__friscyJitStats = latestJitStats;
        updateJitWarmupHud(latestJitStats);
    }
}

function installWorkerRuntimeHandler() {
    if (worker) {
        worker.onmessage = handleWorkerRuntimeMessage;
    }
}

function readJitRuntimeConfig(params) {
    const parseIntParam = (name) => {
        const raw = params.get(name);
        if (raw === null) return null;
        const value = Number.parseInt(raw, 10);
        return Number.isFinite(value) ? value : null;
    };
    const parseFloatParam = (name) => {
        const raw = params.get(name);
        if (raw === null) return null;
        const value = Number.parseFloat(raw);
        return Number.isFinite(value) ? value : null;
    };

    const noPredict = params.has('nojitpredict');
    const cfg = {
        enableJit: !params.has('nojit'),
        jitHotThreshold: parseIntParam('jithot'),
        jitTierEnabled: !params.has('nojittier'),
        jitOptimizeThreshold: parseIntParam('jitopt'),
        jitTraceEnabled: !params.has('nojittrace') && !noPredict,
        jitEdgeHotThreshold: parseIntParam('jitedgehot'),
        jitTraceTripletHotThreshold: parseIntParam('jittrace3hot'),
        jitSchedulerBudget: parseFloatParam('jitbudget'),
        jitSchedulerConcurrency: parseIntParam('jitconcurrency'),
        jitSchedulerConcurrencyValue: parseIntParam('jitconcurrency'),
        jitSchedulerQueueMax: parseIntParam('jitqmax'),
        jitPredictTopK: parseIntParam('jitpredk'),
        jitPredictConfidence: parseFloatParam('jitpredconf'),
        jitMarkovEnabled: !params.has('nojitmarkov') && !noPredict,
        jitTripletEnabled: !params.has('nojittriplet') && !noPredict,
        jitAwaitCompiler: params.has('jitawait'),
        jitHudEnabled: !params.has('nojithud'),
    };
    return cfg;
}

function updateNetStatus(state) {
    if (!netStatusEl) return;
    netStatusEl.className = 'net-status ' + state;
    const labels = { connected: 'net: on', disconnected: 'net: off', connecting: 'net: ...' };
    netStatusEl.textContent = labels[state] || state;
}

function updateTerminalSize() {
    if (term && fitAddon) {
        fitAddon.fit();
        if (worker) {
            worker.postMessage({ type: 'resize', rows: term.rows, cols: term.cols });
        }
    }
    if (term2 && fitAddon2) {
        (fitAddon2 as any).fit();
        if (worker2) {
            (worker2 as any).postMessage({ type: 'resize', rows: (term2 as any).rows, cols: (term2 as any).cols });
        }
    }
}

/**
 * Read stdout ring buffer and write to terminal.
 * Called on a polling interval from the main thread.
 */
function drainStdout() {
    if (!stdoutView || !stdoutBytes || !term) return;

    const writeHead = Atomics.load(stdoutView, 0);
    const readTail = Atomics.load(stdoutView, 1);
    if (writeHead === readTail) return; // empty

    let available;
    if (writeHead >= readTail) {
        available = writeHead - readTail;
    } else {
        available = RING_SIZE - readTail + writeHead;
    }
    if (available <= 0) return;

    const buf = new Uint8Array(available);
    let pos = readTail;
    for (let i = 0; i < available; i++) {
        buf[i] = stdoutBytes[RING_HEADER + pos];
        pos = (pos + 1) % RING_SIZE;
    }

    // Update read tail
    Atomics.store(stdoutView, 1, pos);

    // Decode and write to terminal
    const copied = new Uint8Array(buf.length);
    copied.set(buf);
    const text = new TextDecoder().decode(copied);
    term.write(text);
}

/**
 * Check if worker is requesting stdin. If so, provide data from stdinQueue.
 * Called on a polling interval from the main thread.
 */
function checkStdinRequest() {
    if (!controlView || !controlSab) return;
    const cmd = Atomics.load(controlView, 0);
    if (cmd !== CMD_STDIN_REQUEST) return;

    // Worker wants stdin — wait until we have data
    if (stdinQueue.length === 0) return;

    const maxLen = Atomics.load(controlView, 2);
    const controlBytes = new Uint8Array(controlSab);
    const toSend = Math.min(stdinQueue.length, maxLen, 3968);

    for (let i = 0; i < toSend; i++) {
        controlBytes[64 + i] = stdinQueue.shift()!;
    }

    Atomics.store(controlView, 2, toSend);
    Atomics.store(controlView, 0, CMD_STDIN_READY);
    Atomics.notify(controlView, 0);
}

/**
 * Check for exit signal from worker.
 */
function checkExit() {
    if (!controlView || !term || !statusEl) return false;
    const cmd = Atomics.load(controlView, 0);
    if (cmd === CMD_EXIT) {
        machineRunning = false;
        const exitCode = Atomics.load(controlView, 5);
        term.writeln(`
\x1b[33mProcess exited (code ${exitCode})\x1b[0m`);
        statusEl.textContent = `Exited (${exitCode})`;
        Atomics.store(controlView, 0, CMD_IDLE);
        return true;
    }
    return false;
}

const overlayEl = document.getElementById('progress-overlay');
const stageEl = document.getElementById('progress-stage');
const detailEl = document.getElementById('progress-detail');

// Wavy progress bar — main (squiggly for page load)
const waveCanvas = document.getElementById('progress-canvas') as HTMLCanvasElement;
const waveCtx = waveCanvas?.getContext('2d');
let wavePct = 0;          // 0-100, or -1 for indeterminate
const waveTarget = 0;       // smooth interpolation target
let waveIndeterminate = false;
const wavePhase = 0;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let waveAnimId: number | null = null;

// Main progress bar uses squiggly for page load
const waveMode = 'squiggly';

// SquigglyProgress — ported from Android SystemUI SquigglyProgress.kt
// All measurements in CSS pixels (DPI-scaled automatically on canvas)
const SQ_WAVE_LENGTH = 32;     // CSS px, one full wave period
const SQ_LINE_AMP = 3;         // CSS px, peak amplitude (half of original)
const SQ_PHASE_SPEED = 8;      // CSS px/sec, gentle scroll speed
const SQ_STROKE_W = 6;         // CSS px, stroke width (2x original)
const SQ_TRANSITION_PERIODS = 1.5;  // wavelengths over which amplitude fades (indeterminate mode)
const SQ_DISABLED_ALPHA = 0.25; // alpha multiplier for unplayed flat line (~64/255)
const SQ_TWO_PI = Math.PI * 2;

// Sinusoidal wave parameters
const SINE_WAVE_LENGTH = 40;   // CSS px, one full sine period
const SINE_AMP = 4;            // CSS px, peak amplitude
const SINE_PHASE_SPEED = 60;   // CSS px/sec, scrolling speed
const SINE_STROKE_W = 3;       // CSS px, stroke width
const SINE_STEP = 2;           // CSS px per lineTo segment (resolution)

const FILL_COLOR = '#2ea043';
const WARN_COLOR = '#d29922';
const ERR_COLOR = '#e06c75';
let waveColor: string | null = null;  // null = use FILL_COLOR

const heightFraction = 1;  // amplitude scale (0=flat, 1=full wave)
let sqPhaseOffset = 0;
let sqLastTime = -1;

const demoActive = false;

// DPI-aware canvas setup (crisp on retina/high-DPI displays)
function setupCanvasDPI(canvas, ctx) {
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    if (cssW > 0 && cssH > 0) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        ctx.scale(dpr, dpr);
    }
}
if (waveCanvas && waveCtx) setupCanvasDPI(waveCanvas, waveCtx);
// Helper: clamp-lerp inverse (lerpInvSat)
function lerpInvSat(a, b, v) {
    return Math.max(0, Math.min(1, (v - a) / (b - a)));
}

// Build the cubic-bezier wave path as an array of bezier segments.
// Each half-wavelength is one cubic bezier curve.
// Returns a Path2D spanning from waveStart to waveEnd.
function buildWavePath(waveStart, waveEnd, waveProgressPx, transitionEnabled) {
    const path = new Path2D();
    path.moveTo(waveStart, 0);

    let currentX = waveStart;
    let waveSign = 1;
    const dist = SQ_WAVE_LENGTH / 2;

    function computeAmp(x, sign) {
        if (transitionEnabled) {
            const length = SQ_TRANSITION_PERIODS * SQ_WAVE_LENGTH;
            const coeff = lerpInvSat(
                waveProgressPx + length / 2,
                waveProgressPx - length / 2, x);
            return sign * heightFraction * SQ_LINE_AMP * coeff;
        }
        return sign * heightFraction * SQ_LINE_AMP;
    }

    let currentAmp = computeAmp(currentX, waveSign);
    while (currentX < waveEnd) {
        waveSign = -waveSign;
        const nextX = currentX + dist;
        const midX = currentX + dist / 2;
        const nextAmp = computeAmp(nextX, waveSign);
        path.bezierCurveTo(midX, currentAmp, midX, nextAmp, nextX, nextAmp);
        currentAmp = nextAmp;
        currentX = nextX;
    }
    return path;
}

// --- Sinusoidal wave renderer ---
function drawSineProgress(ctx, W, H, now, progress, color) {
    const midY = H / 2;
    const amp = SINE_AMP;
    const wl = SINE_WAVE_LENGTH;
    const sw = SINE_STROKE_W;
    const step = SINE_STEP;

    // Phase scrolls rightward continuously
    const phase = (now / 1000) * SINE_PHASE_SPEED;
    const totalProgressPx = W * progress;

    ctx.save();
    ctx.translate(0, midY);

    // Unplayed portion: dimmed flat line
    if (totalProgressPx < W) {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.globalAlpha = SQ_DISABLED_ALPHA;
        ctx.lineWidth = sw;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(totalProgressPx, 0);
        ctx.lineTo(W, 0);
        ctx.stroke();
        ctx.restore();
    }

    // Played portion: sine wave (full alpha, clipped to progress)
    if (totalProgressPx > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, -(amp + sw), totalProgressPx, (amp + sw) * 2);
        ctx.clip();
        ctx.strokeStyle = color;
        ctx.globalAlpha = 1;
        ctx.lineWidth = sw;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let x = 0; x <= W; x += step) {
            const y = Math.sin(SQ_TWO_PI * (x - phase) / wl) * amp;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
    }

    ctx.restore();
}

// --- Sinusoidal wave: indeterminate mode (pulsing full-width wave) ---
function drawSineIndeterminate(ctx, W, H, now, color) {
    const midY = H / 2;
    const amp = SINE_AMP;
    const wl = SINE_WAVE_LENGTH;
    const sw = SINE_STROKE_W;
    const step = SINE_STEP;
    const phase = (now / 1000) * SINE_PHASE_SPEED;

    const fakeProgress = 1; // full width, just animate the wave
    const totalProgressPx = W * fakeProgress;

    ctx.save();
    ctx.translate(0, midY);

    // Full wave, dimmed
    ctx.save();
    ctx.beginPath();
    ctx.rect(totalProgressPx, -(amp + sw), W - totalProgressPx, (amp + sw) * 2);
    ctx.clip();
    ctx.strokeStyle = color;
    ctx.globalAlpha = SQ_DISABLED_ALPHA;
    ctx.lineWidth = sw;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let x = 0; x <= W; x += step) {
        const y = Math.sin(SQ_TWO_PI * (x - phase) / wl) * amp;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    // Played portion, bright
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, -(amp + sw), totalProgressPx, (amp + sw) * 2);
    ctx.clip();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 1;
    ctx.lineWidth = sw;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let x = 0; x <= W; x += step) {
        const y = Math.sin(SQ_TWO_PI * (x - phase) / wl) * amp;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    ctx.restore();
}

// --- Squiggly (bezier) wave: determinate mode ---
function drawSquigglyProgress(ctx, W, H, _now, progress, color) {
    const midY = H / 2;
    const totalProgressPx = W * progress;
    const waveStart = -sqPhaseOffset - SQ_WAVE_LENGTH / 2;
    const path = buildWavePath(waveStart, totalProgressPx + SQ_WAVE_LENGTH, totalProgressPx, false);

    ctx.save();
    ctx.translate(0, midY);

    // Unplayed: flat line
    if (totalProgressPx < W) {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.globalAlpha = SQ_DISABLED_ALPHA;
        ctx.lineWidth = SQ_STROKE_W;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(totalProgressPx, 0);
        ctx.lineTo(W, 0);
        ctx.stroke();
        ctx.restore();
    }

    // Played: squiggly wave clipped to progress
    if (totalProgressPx > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, -(SQ_LINE_AMP + SQ_STROKE_W),
            totalProgressPx, (SQ_LINE_AMP + SQ_STROKE_W) * 2);
        ctx.clip();
        ctx.strokeStyle = color;
        ctx.globalAlpha = 1;
        ctx.lineWidth = SQ_STROKE_W;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke(path);
        ctx.restore();
    }

    // Round cap at x=0
    const startAmp = Math.cos(Math.abs(waveStart) / SQ_WAVE_LENGTH * SQ_TWO_PI);
    ctx.beginPath();
    ctx.arc(0, startAmp * SQ_LINE_AMP * heightFraction,
        SQ_STROKE_W / 2, 0, SQ_TWO_PI);
    ctx.fillStyle = color;
    ctx.fill();

    ctx.restore();
}

// --- Squiggly (bezier) wave: indeterminate mode ---
function drawSquigglyIndeterminate(ctx, W, H, _now, color) {
    const midY = H / 2;
    const fakeProgress = 1; // full width, just animate the wave
    const totalProgressPx = W * fakeProgress;
    const waveStart = -sqPhaseOffset - SQ_WAVE_LENGTH / 2;
    const path = buildWavePath(waveStart, W, totalProgressPx, true);

    ctx.save();
    ctx.translate(0, midY);

    // Unplayed (dimmed)
    ctx.save();
    ctx.beginPath();
    ctx.rect(totalProgressPx, -(SQ_LINE_AMP + SQ_STROKE_W),
        W - totalProgressPx, (SQ_LINE_AMP + SQ_STROKE_W) * 2);
    ctx.clip();
    ctx.strokeStyle = color;
    ctx.globalAlpha = SQ_DISABLED_ALPHA;
    ctx.lineWidth = SQ_STROKE_W;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke(path);
    ctx.restore();

    // Played (full alpha)
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, -(SQ_LINE_AMP + SQ_STROKE_W),
        totalProgressPx, (SQ_LINE_AMP + SQ_STROKE_W) * 2);
    ctx.clip();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 1;
    ctx.lineWidth = SQ_STROKE_W;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke(path);
    ctx.restore();

    ctx.restore();
}

// Ensure canvas pixel buffer matches CSS size (call each frame)
function ensureCanvasDPI(canvas, ctx) {
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    const pixW = Math.round(cssW * dpr);
    const pixH = Math.round(cssH * dpr);
    if (pixW > 0 && pixH > 0 && (canvas.width !== pixW || canvas.height !== pixH)) {
        canvas.width = pixW;
        canvas.height = pixH;
        ctx.scale(dpr, dpr);
    }
    return { W: cssW, H: cssH };
}

// --- Single unified animation loop (no racing rAF callbacks) ---
function drawWave(timestamp) {
    const now = timestamp || performance.now();

    if (!demoActive && !waveIndeterminate) {
        wavePct += (waveTarget - wavePct) * 0.12;
    }

    // Squiggly phase animation (time-based, delta)
    if (sqLastTime < 0) sqLastTime = now;
    const dt = (now - sqLastTime) / 1000; // seconds since last frame
    sqPhaseOffset += dt * SQ_PHASE_SPEED;
    sqPhaseOffset %= SQ_WAVE_LENGTH;
    sqLastTime = now;

    const color = waveColor || FILL_COLOR;
    const progress = wavePct / 100;

    // --- Main progress canvas ---
    if (waveCanvas && waveCtx) {
        const { W, H } = ensureCanvasDPI(waveCanvas, waveCtx);
        waveCtx.clearRect(0, 0, W, H);
        if (waveIndeterminate) {
            if (waveMode === 'sine') drawSineIndeterminate(waveCtx, W, H, now, color);
            else drawSquigglyIndeterminate(waveCtx, W, H, now, color);
        } else {
            if (waveMode === 'sine') drawSineProgress(waveCtx, W, H, now, progress, color);
            else drawSquigglyProgress(waveCtx, W, H, now, progress, color);
        }
    }

    waveAnimId = requestAnimationFrame(drawWave);
}

// Start single animation loop
waveAnimId = requestAnimationFrame(drawWave);

function setProgress(pct, stage, detail) {
    if (stage && stageEl) stageEl.textContent = stage;
    if (pct < 0) {
        waveIndeterminate = true;
    } else {
        waveIndeterminate = false;
        wavePct = pct;
    }
    if (detailEl) detailEl.textContent = detail || '\u00a0';
}

function formatBytes(bytes) {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

const STALL_TIMEOUT_MS = 10000;  // 10s with no data = stalled
const MAX_RETRIES = 5;
const RETRY_DELAYS = [1000, 2000, 4000, 8000, 15000]; // backoff

async function fetchWithProgress(url) {
    // First request to get total size
    let total = 0;
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    let retries = 0;
    const startTime = performance.now();

    while (true) {
        try {
            const headers = {};
            if (loaded > 0) {
                headers['Range'] = `bytes=${loaded}-`;
            }

            waveColor = null; // reset to green
            const resp = await fetch(url, { headers });

            if (!resp.ok && resp.status !== 206) {
                throw new Error(`HTTP ${resp.status}`);
            }

            // Get total size from first request or Content-Range on resume
            if (total === 0) {
                if (resp.status === 206) {
                    const range = resp.headers.get('Content-Range');
                    if (range) total = parseInt(range.split('/')[1], 10) || 0;
                } else {
                    total = parseInt(resp.headers.get('Content-Length') || '0', 10) || 0;
                }
            }

            if (!resp.body) {
                // No streaming support — fallback
                const buf = await resp.arrayBuffer();
                setProgress(100, null, formatBytes(buf.byteLength) + ' downloaded');
                return buf;
            }

            const reader = resp.body.getReader();
            retries = 0; // reset on successful connection

            if (loaded > 0) {
                waveColor = null;
                setProgress(
                    total ? Math.round((loaded / total) * 100) : -1,
                    `Downloading (resumed)...`,
                    undefined
                );
            }

            while (true) {
                // Race read against stall timeout
                const readPromise = reader.read();
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('stall')), STALL_TIMEOUT_MS)
                );

                let result;
                try {
                    result = await Promise.race([readPromise, timeoutPromise]);
                } catch (e) {
                    // Stall detected — abort this reader and retry
                    try { reader.cancel(); } catch (_se) {
                        // ignore
                    }
                    waveColor = WARN_COLOR;
                    setProgress(
                        total ? Math.round((loaded / total) * 100) : -1,
                        null,
                        'Download stalled, retrying...'
                    );
                    throw e;
                }

                const { done, value } = result;
                if (done) break;

                chunks.push(value);
                loaded += value.length;
                const pct = total ? Math.min(99, Math.round((loaded / total) * 100)) : -1;
                const elapsed = (performance.now() - startTime) / 1000;
                const speed = elapsed > 0 ? loaded / elapsed : 0;
                setProgress(pct, null,
                    `${formatBytes(loaded)} / ${total ? formatBytes(total) : '?'}  \u2022  ${formatBytes(speed)}/s`);
            }

            // Download complete
            break;

        } catch (err: any) {
            retries++;
            if (retries > MAX_RETRIES) {
                waveColor = ERR_COLOR;
                setProgress(
                    total ? Math.round((loaded / total) * 100) : 0,
                    'Download failed',
                    `${err.message} \u2014 reload to retry`
                );
                throw new Error(`Download failed after ${MAX_RETRIES} retries: ${err.message}`, { cause: err });
            }

            const delay = RETRY_DELAYS[Math.min(retries - 1, RETRY_DELAYS.length - 1)];
            waveColor = WARN_COLOR;

            // Countdown retry timer
            for (let remaining = Math.ceil(delay / 1000); remaining > 0; remaining--) {
                setProgress(
                    total ? Math.round((loaded / total) * 100) : 0,
                    null,
                    `Connection lost \u2014 retrying in ${remaining}s (attempt ${retries}/${MAX_RETRIES})`
                );
                await new Promise(r => setTimeout(r, 1000));
            }

            setProgress(
                total ? Math.round((loaded / total) * 100) : 0,
                null,
                `Reconnecting... (attempt ${retries}/${MAX_RETRIES})`
            );
        }
    }

    // Combine chunks
    const result = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }
    waveColor = null;
    setProgress(100, null, formatBytes(loaded) + ' downloaded');
    return result.buffer;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function main() {
    // Snapshot net-status HTML before any textContent call destroys it
    const netStatusHTML = (document.getElementById('net-status') || {outerHTML: ''}).outerHTML;

    // Check for SharedArrayBuffer support (requires COOP/COEP headers)
    if (typeof SharedArrayBuffer === 'undefined') {
        if (statusEl) statusEl.textContent = 'Error: SharedArrayBuffer not available';
        if (stageEl) stageEl.textContent = 'Cross-origin isolation required';
        if (detailEl) detailEl.textContent = 'Serve with COOP/COEP headers (use serve.js)';
        return;
    }

    // Import tab: show import panel instead of booting
    if (activeExample === 'import') {
        if (overlayEl) overlayEl.style.display = 'none';
        document.getElementById('import-panel')?.classList.add('visible');
        if (statusEl) statusEl.textContent = 'Import';
        // @ts-ignore
        if (typeof initImportPanel === 'function') initImportPanel();
        return;
    }

    setProgress(-1, 'Loading manifest...', undefined);
    const manifest = await fetch('./manifest.json').then(r => r.json());

    // Resolve example-specific config (rootfs, entrypoint, image name)
    const exampleCfg = (activeExample && manifest.examples && manifest.examples[activeExample]) || {};
    const imageName = exampleCfg.image || manifest.image;
    const rootfsUrl = exampleCfg.rootfs || manifest.rootfs || './rootfs.tar';
    if (statusEl) statusEl.textContent = `Loading ${imageName}...`;

    // Download rootfs with progress (+ companion rootfs for server tab)
    setProgress(0, `Loading ${imageName}...`, 'Starting download...');
    let companionRootfs = null;
    let rootfs;
    if (activeExample === 'server') {
        const results = await Promise.all([
            fetchWithProgress(rootfsUrl),
            fetch('./rootfs.tar').then(r => r.arrayBuffer()),
        ]);
        rootfs = results[0];
        companionRootfs = results[1];
    } else {
        rootfs = await fetchWithProgress(rootfsUrl);
    }

    // Initialize runtime (indeterminate)
    setProgress(-1, 'Initializing runtime...', undefined);

    // For server tab, open primary terminal in #terminal-server (dual pane)
    const isDual = activeExample === 'server';
    const primaryTermEl = isDual
        ? document.getElementById('terminal-server')
        : terminalEl;

    if (!primaryTermEl) return;

    // Initialize xterm.js — "Void Aurora" theme, tuned for readability
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    const isNarrow = window.innerWidth < 800;
    
    const termOptions = {
        cursorBlink: true,
        cursorStyle: 'bar',
        cursorInactiveStyle: 'outline',
        cursorWidth: 2,
        convertEol: true,
        allowProposedApi: true,
        fontSize: isMobile ? 13 : isNarrow ? 14 : 16,
        fontFamily: '"Maple Mono", "Cascadia Code", "Fira Code", Menlo, Monaco, monospace',
        fontWeight: '400',
        fontWeightBold: '700',
        lineHeight: 1.25,
        letterSpacing: 0,
        scrollback: 50000,
        smoothScrollDuration: 80,
        minimumContrastRatio: 4.5,
        customGlyphs: true,
        rescaleOverlappingGlyphs: true,
        drawBoldTextInBrightColors: false,
        altClickMovesCursor: true,
        scrollOnUserInput: true,
        rightClickSelectsWord: true,
        macOptionIsMeta: true,
        macOptionClickForcesSelection: true,
        overviewRulerWidth: 14,
        theme: FRISCY_THEME,
        copyOnSelect: true,
        bellStyle: 'none',
        screenReaderMode: false,
    };
    term = new Terminal(termOptions as any);
    fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    // WebGL renderer
    try {
        const webgl = new WebglAddon();
        webgl.onContextLoss(() => { webgl.dispose(); });
        term.loadAddon(webgl);
    } catch (_e) {
        console.warn('[xterm] WebGL2 not available, using canvas renderer');
    }

    // Clickable URLs with hover highlight
    term.loadAddon(new WebLinksAddon((_e, uri) => {
        window.open(uri, '_blank', 'noopener');
    }, {
        hover: (_e, uri) => {
            primaryTermEl.style.cursor = 'pointer';
            primaryTermEl.title = uri;
            if (_e.target) (_e.target as HTMLElement).style.textDecoration = 'underline';
        },
        leave: (_e, _uri) => {
            primaryTermEl.style.cursor = '';
            primaryTermEl.title = '';
            if (_e.target) (_e.target as HTMLElement).style.textDecoration = '';
        },
    }));

    // Inline images
    try {
        const imageAddon = new ImageAddon({
            enableSizeReports: true,
            pixelLimit: 16777216,
            sixelSupport: true,
            sixelScrolling: true,
            sixelPaletteLimit: 4096,
            iipSupport: true,
            storageLimit: 128,
        });
        term.loadAddon(imageAddon);
    } catch (e: any) {
        console.warn('[xterm] Image addon not available:', e.message);
    }

    // Unicode 11 for correct CJK/emoji widths
    const unicode11 = new Unicode11Addon();
    term.loadAddon(unicode11);
    term.unicode.activeVersion = '11';

    // Search (Ctrl+Shift+F)
    const searchAddon = new SearchAddon();
    term.loadAddon(searchAddon);

    // Drag & drop images into terminal
    setupDragDrop(primaryTermEl, term);

    // Clipboard: Ctrl+C (copy selection or SIGINT), Ctrl+V paste
    setupClipboard(term);

    function debounce(fn, ms) {
        let id;
        return (...args) => { clearTimeout(id); id = setTimeout(() => fn(...args), ms); };
    }
    const debouncedFit = debounce(updateTerminalSize, 150);
    window.addEventListener('resize', debouncedFit);

    // Font size adjustment
    window.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === '=') {
            e.preventDefault();
            term.options.fontSize = Math.min(32, (term.options.fontSize || 14) + 1);
            fitAddon.fit();
        } else if (e.ctrlKey && e.key === '-') {
            e.preventDefault();
            term.options.fontSize = Math.max(8, (term.options.fontSize || 14) - 1);
            fitAddon.fit();
        }
    });

    // Middle-click paste
    primaryTermEl.addEventListener('mousedown', (e) => {
        if (e.button === 1) { // Middle mouse button
            e.preventDefault();
            navigator.clipboard.readText().then(text => {
                if (text) term.paste(text);
            }).catch(() => {});
        }
    });

    // Theme toggle
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    let isDarkTheme = true;
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            isDarkTheme = !isDarkTheme;
            term.options.theme = isDarkTheme ? FRISCY_THEME : LIGHT_THEME;
            document.body.style.background = isDarkTheme ? '#050810' : '#f0f0f0';
            document.body.style.color = isDarkTheme ? '#e6e1cf' : '#333333';
        });
    }

    // Create SharedArrayBuffers for Worker communication
    controlSab = new SharedArrayBuffer(4096);   // Control channel
    stdoutSab = new SharedArrayBuffer(65536);    // 64KB stdout ring buffer
    netSab = new SharedArrayBuffer(65536);       // 64KB network RPC

    controlView = new Int32Array(controlSab);
    stdoutView = new Int32Array(stdoutSab);
    stdoutBytes = new Uint8Array(stdoutSab);

    // Spawn Worker
    setProgress(-1, 'Starting worker...', undefined);
    worker = new Worker('./worker.js', { type: 'module' });

    // Wait for Worker to be ready
    const workerReady = new Promise((resolve, reject) => {
        if (!worker) return reject();
        const onMsg = (e) => {
            if (e.data.type === 'ready') { resolve(undefined); if (worker) worker.onmessage = null; }
            if (e.data.type === 'error') reject(new Error(`Worker: ${e.data.message}`));
        };
        worker.onmessage = onMsg;
        worker.onerror = (e) => {
            const detail = e.message || `${e.filename || 'worker.js'}:${e.lineno || '?'}`;
            console.error('[main] Worker error:', detail, e);
            reject(new Error(`Worker failed: ${detail}`));
        };
    });

    const params = new URLSearchParams(location.search);
    const jitCfg = readJitRuntimeConfig(params);
    jitHudEnabled = jitCfg.jitHudEnabled;
    if (!jitHudEnabled && jitWarmupHudEl) {
        jitWarmupHudEl.classList.remove('visible');
    }

    // Send init message with SABs
    worker.postMessage({
        type: 'init',
        controlSab,
        stdoutSab,
        netSab,
        enableJit: jitCfg.enableJit,
        jitHotThreshold: jitCfg.jitHotThreshold,
        jitTierEnabled: jitCfg.jitTierEnabled,
        jitOptimizeThreshold: jitCfg.jitOptimizeThreshold,
        jitTraceEnabled: jitCfg.jitTraceEnabled,
        jitEdgeHotThreshold: jitCfg.jitEdgeHotThreshold,
        jitTraceTripletHotThreshold: jitCfg.jitTraceTripletHotThreshold,
        jitSchedulerBudget: jitCfg.jitSchedulerBudget,
        jitSchedulerConcurrency: jitCfg.jitSchedulerConcurrency,
        jitSchedulerQueueMax: jitCfg.jitSchedulerQueueMax,
        jitPredictTopK: jitCfg.jitPredictTopK,
        jitPredictConfidence: jitCfg.jitPredictConfidence,
        jitMarkovEnabled: jitCfg.jitMarkovEnabled,
        jitTripletEnabled: jitCfg.jitTripletEnabled,
        jitAwaitCompiler: jitCfg.jitAwaitCompiler,
    });

    await workerReady;
    installWorkerRuntimeHandler();

    // Network: VectorHeart hypercalls handle networking via JSPI (no proxy needed)
    updateNetStatus('connected');

    // Transition: hide overlay FIRST, then show + open terminals
    overlayEl?.classList.add('hidden');
    if (isDual) {
        document.getElementById('dual-terminal-container')?.classList.add('active');
    } else {
        if (terminalEl) terminalEl.style.display = 'flex';
    }
    const resetBtn = document.getElementById('reset-btn');
    if (resetBtn) resetBtn.style.display = 'block';

    // Now open xterm into the visible, measurable container
    term.open(primaryTermEl);
    primaryTermEl.addEventListener('click', () => term.focus());
    fitAddon.fit();
    Atomics.store(controlView, 6, term.cols);  // offset 24
    Atomics.store(controlView, 7, term.rows);  // offset 28
    term.focus();
    // Re-fit after one frame to catch any layout reflow
    requestAnimationFrame(() => updateTerminalSize());

    const rootfsMB = (rootfs.byteLength / 1024 / 1024).toFixed(1);
    if (activeExample === 'claude') {
        term.writeln('\x1b[4:3m\x1b[58;2;255;0;255mEphemeral Claude Code Container\x1b[0m');
        term.writeln('');
        term.writeln('\x1b[1;32mfriscy\x1b[0m disposable sandbox — runs entirely in your browser');
        term.writeln(`Image: ${manifest.image} (${rootfsMB} MB)`);
        term.writeln('\x1b[32mNetwork: VectorHeart (JSPI)\x1b[0m');
    } else {
        term.writeln('\x1b[4:3m\x1b[58;2;255;0;255mdocker-in-browser\x1b[0m');
        term.writeln('');
        term.writeln('\x1b[1;32mfriscy\x1b[0m fast risc-v runtime for the browser & wasm');
        term.writeln(`Image: ${manifest.image} (${rootfsMB} MB)`);
        term.writeln('\x1b[32mNetwork: VectorHeart (JSPI)\x1b[0m');
    }
    term.writeln('');

    // Sixel image example
    const SIXEL_IMAGE_DATA = "\x1bPq\x221;1;10;10#0;2;0;0;0#1;2;100;0;0#0!10~#1!10~#2!10~#1!10~#0!10~#1!10~#2!10~#1!10~#0!10~#1!10~\x1b";
    term.writeln("Type 'sixel' to display a Sixel image.");
    term.onData(data => {
        if (data.trim() === 'sixel') {
            term.write(SIXEL_IMAGE_DATA);
        }
    });

    // --- Search bar wiring ---
    const searchBarEl = document.getElementById('search-bar');
    const searchInputEl = document.getElementById('search-input') as HTMLInputElement;
    function openSearch() {
        searchBarEl?.classList.add('visible');
        searchInputEl?.focus();
        searchInputEl?.select();
    }
    function closeSearch() {
        searchBarEl?.classList.remove('visible');
        searchAddon.clearDecorations();
        term.focus();
    }
    searchInputEl?.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' && ev.shiftKey) { searchAddon.findPrevious(searchInputEl.value); ev.preventDefault(); }
        else if (ev.key === 'Enter') { searchAddon.findNext(searchInputEl.value); ev.preventDefault(); }
        else if (ev.key === 'Escape') { closeSearch(); ev.preventDefault(); }
    });
    searchInputEl?.addEventListener('input', () => { if (searchInputEl.value) searchAddon.findNext(searchInputEl.value); });
    document.getElementById('search-prev')?.addEventListener('click', () => searchAddon.findPrevious(searchInputEl.value));
    document.getElementById('search-next')?.addEventListener('click', () => searchAddon.findNext(searchInputEl.value));
    document.getElementById('search-close')?.addEventListener('click', closeSearch);

    // --- Clipboard support (Ctrl+C/V) + Search (Ctrl+Shift+F) + Tab ---
    term.attachCustomKeyEventHandler((ev) => {
        if (ev.type === 'keydown' && ev.ctrlKey && ev.shiftKey && ev.key === 'F') {
            openSearch();
            return false;
        }
        if (ev.type === 'keydown' && ev.ctrlKey && ev.key === 'c' && term.hasSelection()) {
            navigator.clipboard.writeText(term.getSelection());
            return false;
        }
        if (ev.type === 'keydown' && ev.ctrlKey && ev.key === 'v') {
            navigator.clipboard.readText().then(text => {
                if (text) term.paste(text);
            }).catch(() => {});
            return false;
        }
        if (ev.key === 'Tab') {
            ev.preventDefault();
            return true;
        }
        return true;
    });

    // --- Input handler: raw passthrough to guest stdin via SAB ---
    term.onData((data) => {
        if (!machineRunning) return;

        for (let i = 0; i < data.length; i++) {
            const code = data.charCodeAt(i);

            if (code === 3) {
                stdinQueue.push(0x03);
            } else if (code === 26) {
                stdinQueue.push(0x1a);
            } else if (code === 12) {
                term.clear();
                stdinQueue.push(0x0c);
            } else if (code === 4) {
                stdinQueue.push(0x04);
            } else if (data[i] === '\r') {
                stdinQueue.push(0x0a);
            } else if (code === 127) {
                stdinQueue.push(0x7f);
            } else if (code === 27) {
                const bytes = new TextEncoder().encode(data.slice(i));
                stdinQueue.push(...Array.from(bytes));
                break;
            } else {
                const bytes = new TextEncoder().encode(data[i]);
                stdinQueue.push(...Array.from(bytes));
            }
        }

        // If worker is currently requesting stdin, fulfill it immediately
        checkStdinRequest();
    });

    // Start main polling loop
    const pollTimer = setInterval(() => {
        drainStdout();
        checkStdinRequest();
        if (checkExit()) {
            clearInterval(pollTimer);
        }
    }, 4); // ~4ms polling for responsive I/O

    // Build args
    const entrypoint = exampleCfg.entrypoint || manifest.entrypoint;
    const guestCmd = Array.isArray(entrypoint) ? entrypoint : entrypoint.split(' ').filter(s => s);
    const defaultEnv = manifest.env || [];
    const exampleEnv = exampleCfg.env || [];
    const envMap = new Map();
    for (const e of defaultEnv) { const k = e.split('=')[0]; envMap.set(k, e); }
    for (const e of exampleEnv) { const k = e.split('=')[0]; envMap.set(k, e); }
    const envVars = [...envMap.values()];
    const envArgs = envVars.flatMap(e => ['--env', e]);
    const args = [...envArgs, '--rootfs', '/rootfs.tar', ...guestCmd];

    if (statusEl) statusEl.textContent = 'Booting...';
    machineRunning = true;

    // Send rootfs data + run command to worker
    const rootfsArray = new Uint8Array(rootfs);
    worker.postMessage({
        type: 'run',
        args,
        rootfsData: rootfsArray.buffer,
    }, [rootfsArray.buffer]);

    if (statusEl) statusEl.innerHTML = 'fast risc-v runtime for the browser &amp; wasm' + netStatusHTML;

    // Server tab
    if (activeExample === 'server' && companionRootfs) {
        // @ts-ignore
        if (typeof bootCompanion === 'function') bootCompanion(companionRootfs, (window as any).proxyUrl).then(() => (window as any).runAutoWget?.());
    }

    // Auto-run uname -a
    if (activeExample === 'alpine') {
        const waitForShell = () => {
            if (controlView && Atomics.load(controlView, 0) === 1) {
                const cmd = 'uname -a\n';
                for (let i = 0; i < cmd.length; i++) {
                    stdinQueue.push(cmd.charCodeAt(i));
                }
                checkStdinRequest();
            } else {
                setTimeout(waitForShell, 200);
            }
        };
        setTimeout(waitForShell, 1000);
    }
}

// --- Tab bar ---
const activeExample = params.get('example') || 'alpine';

document.querySelectorAll('.tab').forEach(tab => {
    if ((tab as HTMLElement).dataset.example === activeExample) tab.classList.add('active');
    else tab.classList.remove('active');
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function switchExample(name) {
    const u = new URL(location.href);
    if (name === 'alpine') u.searchParams.delete('example');
    else u.searchParams.set('example', name);
    location.href = u.toString();
}
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchExample((tab as HTMLElement).dataset.example));
});
document.getElementById('reset-btn')?.addEventListener('click', () => location.reload());

// --- Popular Docker images for autocomplete ---
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const POPULAR_IMAGES = [
    'ubuntu','alpine','debian','busybox','centos','fedora','archlinux','amazonlinux','oraclelinux','rockylinux','almalinux','clearlinux',
    'node','python','ruby','rust','golang','openjdk','eclipse-temurin','amazoncorretto','php','perl','erlang','elixir','swift','dart','julia','haskell','clojure','groovy','scala','dotnet/sdk','dotnet/runtime',
    'nginx','httpd','caddy','traefik','haproxy','envoyproxy/envoy',
    'postgres','mysql','mariadb','mongo','redis','memcached','cassandra','couchdb','neo4j','influxdb','clickhouse/clickhouse-server','timescale/timescaledb',
    'rabbitmq','nats','mosquitto','kafka',
    'elasticsearch','kibana','logstash','grafana/grafana','prom/prometheus','prom/alertmanager',
    'vault','consul','etcd',
    'docker','docker/compose','registry','portainer/portainer-ce',
    'jenkins/jenkins','gitlab/gitlab-ce','gitea/gitea','drone/drone','sonarqube',
    'nextcloud','wordpress','ghost','mediawiki','drupal','joomla',
    'minio/minio','rclone/rclone',
    'ubuntu:22.04','ubuntu:24.04','ubuntu:latest','debian:bookworm','debian:bullseye','alpine:3.19','alpine:3.20','alpine:edge',
    'node:22','node:20','node:lts','node:alpine','python:3.12','python:3.11','python:slim','python:alpine',
    'rust:latest','rust:slim','rust:alpine','golang:1.22','golang:1.21','golang:alpine',
    'nginx:alpine','nginx:latest','redis:alpine','redis:latest','postgres:16','postgres:15','postgres:alpine',
    'mongo:7','mongo:6','mysql:8','mariadb:11','mariadb:10',
    'gcc','cmake','maven','gradle','composer','pip','cargo','npm',
    'curl','wget','git','openssh-server','openssl',
    'bash','zsh','fish','tmux','vim','neovim','emacs',
    'ubuntu:20.04','ubuntu:18.04','centos:7','fedora:39','fedora:40',
];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function initImportPanel() {
    const input = document.getElementById('import-input') as HTMLInputElement;
    const chip = document.getElementById('import-chip');
    const ac = document.getElementById('import-ac');
    const goBtn = document.getElementById('import-go-btn') as HTMLButtonElement;
    const statusDiv = document.getElementById('import-status');
    const importCanvas = document.getElementById('import-progress-canvas') as HTMLCanvasElement;
    const importCtx = importCanvas?.getContext('2d');
    let importProgress = 0;
    let importAnimId: number | null = null;
    const PINK = '#f9a8d4';

    function drawImportProgress() {
        if (!importCanvas || !importCtx) return;
        const { W, H } = ensureCanvasDPI(importCanvas, importCtx);
        importCtx.clearRect(0, 0, W, H);
        if (importProgress < 0) {
            // @ts-ignore
            drawSquigglyIndeterminate(importCtx, W, H, performance.now(), PINK);
        } else {
            // @ts-ignore
            drawSquigglyProgress(importCtx, W, H, performance.now(), importProgress, PINK);
        }
        importAnimId = requestAnimationFrame(drawImportProgress);
    }
    let selectedIdx = -1;
    let filtered: string[] = [];

    function updateChip() {
        chip?.classList.toggle('hidden', input.value.length > 0 || document.activeElement === input);
    }

    input?.addEventListener('focus', () => { chip?.classList.add('hidden'); });
    input?.addEventListener('blur', () => { setTimeout(updateChip, 150); });
    input?.addEventListener('input', () => {
        updateChip();
        updateAutocomplete();
    });

    chip?.addEventListener('click', () => {
        input.value = 'ubuntu:latest';
        chip.classList.add('hidden');
        input.focus();
        updateAutocomplete();
    });

    function updateAutocomplete() {
        const q = input.value.trim().toLowerCase();
        if (!q) { ac?.classList.remove('open'); filtered = []; return; }
        filtered = POPULAR_IMAGES.filter(img => img.toLowerCase().includes(q)).slice(0, 12);
        if (filtered.length === 0 || (filtered.length === 1 && filtered[0] === q)) {
            ac?.classList.remove('open');
            return;
        }
        selectedIdx = -1;
        renderAC();
        ac?.classList.add('open');
    }

    function renderAC() {
        if (!ac) return;
        const q = input.value.trim().toLowerCase();
        ac.innerHTML = filtered.map((img, i) => {
            const idx = img.toLowerCase().indexOf(q);
            let html;
            if (idx >= 0) {
                html = escHtml(img.slice(0, idx))
                    + '<span class="match">' + escHtml(img.slice(idx, idx + q.length)) + '</span>'
                    + escHtml(img.slice(idx + q.length));
            } else {
                html = escHtml(img);
            }
            return `<div class="import-ac-item${i === selectedIdx ? ' selected' : ''}" data-idx="${i}">${html}</div>`;
        }).join('');
    }

    function escHtml(s) {
        return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    ac?.addEventListener('mousedown', (e) => {
        const item = (e.target as HTMLElement).closest('.import-ac-item');
        if (item) {
            input.value = filtered[+(item as any).dataset.idx];
            ac.classList.remove('open');
            input.focus();
        }
    });

    input?.addEventListener('keydown', (e) => {
        if (!ac?.classList.contains('open')) {
            if (e.key === 'Enter') { doImport(); e.preventDefault(); }
            if (e.key === 'Tab' && input.value === '') {
                e.preventDefault();
                input.value = 'ubuntu:latest';
                chip?.classList.add('hidden');
                updateAutocomplete();
            }
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIdx = Math.min(selectedIdx + 1, filtered.length - 1);
            renderAC();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIdx = Math.max(selectedIdx - 1, -1);
            renderAC();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedIdx >= 0) input.value = filtered[selectedIdx];
            ac.classList.remove('open');
            if (input.value.trim()) doImport();
        } else if (e.key === 'Escape') {
            ac.classList.remove('open');
        } else if (e.key === 'Tab') {
            e.preventDefault();
            if (selectedIdx >= 0) input.value = filtered[selectedIdx];
            else if (filtered.length > 0) input.value = filtered[0];
            ac.classList.remove('open');
        }
    });

    const importForm = document.getElementById('import-form');
    importForm?.addEventListener('submit', (e) => { e.preventDefault(); doImport(); });

    async function doImport() {
        let image = input.value.trim();
        if (!image) {
            image = 'ubuntu:latest';
            input.value = image;
        }
        if (!image.includes(':')) image += ':latest';

        if (goBtn) goBtn.disabled = true;
        input.disabled = true;
        ac?.classList.remove('open');
        if (statusDiv) statusDiv.textContent = `Pulling ${image}...`;
        importCanvas?.classList.add('visible');
        importProgress = -1;
        if (!importAnimId) importAnimId = requestAnimationFrame(drawImportProgress);

        try {
            const proxyHost = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
                ? `https://${location.hostname}:4434`
                : 'https://78.141.219.102.nip.io';
            const pullUrl = `${proxyHost}/pull?image=${encodeURIComponent(image)}`;

            const resp = await fetch(pullUrl);
            if (!resp.ok) {
                const errText = await resp.text();
                throw new Error(errText || `HTTP ${resp.status}`);
            }

            const total = parseInt(resp.headers.get('Content-Length') || '0', 10);
            const reader = resp.body?.getReader();
            const chunks: Uint8Array[] = [];
            let loaded = 0;

            if (reader) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    chunks.push(value);
                    loaded += value.length;
                    importProgress = total ? loaded / total : -1;
                    if (statusDiv) statusDiv.textContent = `Pulling ${image}... ${(loaded/1024/1024).toFixed(1)} MB` + (total ? ` / ${(total/1024/1024).toFixed(1)} MB` : '');
                }
            }

            importProgress = 1.0;
            if (statusDiv) statusDiv.textContent = `Booting ${image}...`;

            const rootfs = new Uint8Array(loaded);
            let off = 0;
            for (const c of chunks) { rootfs.set(c, off); off += c.length; }

            importCanvas?.classList.remove('visible');
            if (importAnimId) { cancelAnimationFrame(importAnimId); importAnimId = null; }
            // @ts-ignore
            if (typeof bootImportedImage === 'function') bootImportedImage(image, rootfs.buffer);

        } catch (e: any) {
            if (statusDiv) statusDiv.textContent = `Error: ${e.message}`;
            importCanvas?.classList.remove('visible');
            if (importAnimId) { cancelAnimationFrame(importAnimId); importAnimId = null; }
            if (goBtn) goBtn.disabled = false;
            input.disabled = false;
        }
    }
}
