import { FriscyNetworkBridge } from '/docs_site/network_bridge.js';
import { NetworkRPCHost } from '/docs_site/network_rpc_host.js';

const CMD_IDLE = 0;
const CMD_STDIN_REQUEST = 2;
const CMD_STDIN_READY = 3;
const CMD_EXIT = 4;
const CMD_EXPORT_CHECKPOINT = 9;
const CMD_ACTIVATE_VH_STAGE2 = 10;
const RING_HEADER = 8;
const RING_SIZE = 65528;

const termEl = document.getElementById('term');
const statusEl = document.getElementById('status');
const bootEl = document.getElementById('boot');
const cmdEl = document.getElementById('cmd');
const sendEl = document.getElementById('send');
const tabEls = Array.from(document.querySelectorAll('.tab'));

const stdinQueue = [];
let worker = null;
let controlView = null;
let controlBytes = null;
let stdoutView = null;
let stdoutBytes = null;
let pollId = null;
let stdoutCarry = '';
let currentExample = 'alpine';
let expectsInput = true;
let inputReady = false;
let netBridge = null;
let netRpcHost = null;

function setStatus(t) { statusEl.textContent = t; }
function setBoot(t) { bootEl.textContent = t; }
function setInputEnabled(enabled) {
  cmdEl.disabled = !enabled;
  sendEl.disabled = !enabled;
}
function writeTerm(t) {
  termEl.textContent += t;
  termEl.scrollTop = termEl.scrollHeight;
}

function installDebugHooks() {
  if (typeof window === 'undefined') return;
  window.__goldenWorker = worker;
  window.__goldenActivateVhStage2 = () => {
    if (!worker || !controlView) return Promise.reject(new Error('golden worker not initialized'));
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('vh stage2 activation timeout'));
      }, 30000);
      const onMessage = (e) => {
        if (e.data?.type === 'vh-stage2-activated') {
          clearTimeout(timeout);
          cleanup();
          resolve(e.data);
        } else if (e.data?.type === 'vh-stage2-error') {
          clearTimeout(timeout);
          cleanup();
          reject(new Error(e.data.message || 'vh stage2 activation failed'));
        }
      };
      const onError = (e) => {
        clearTimeout(timeout);
        cleanup();
        reject(new Error(e.message || 'worker error during vh stage2 activation'));
      };
      const cleanup = () => {
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
      };
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
      Atomics.store(controlView, 0, CMD_ACTIVATE_VH_STAGE2);
      Atomics.notify(controlView, 0);
    });
  };
  window.__goldenExportLiveCheckpoint = () => {
    if (!worker || !controlView) return Promise.reject(new Error('golden worker not initialized'));
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('live checkpoint export timeout'));
      }, 120000);
      const onMessage = (e) => {
        if (e.data?.type === 'checkpoint-exported-live') {
          clearTimeout(timeout);
          cleanup();
          resolve(e.data);
        } else if (e.data?.type === 'checkpoint-export-error') {
          clearTimeout(timeout);
          cleanup();
          reject(new Error(e.data.message || 'checkpoint export failed'));
        }
      };
      const onError = (e) => {
        clearTimeout(timeout);
        cleanup();
        reject(new Error(e.message || 'worker error during checkpoint export'));
      };
      const cleanup = () => {
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
      };
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
      Atomics.store(controlView, 0, CMD_EXPORT_CHECKPOINT);
      Atomics.notify(controlView, 0);
    });
  };
}

function activeExample() {
  return new URLSearchParams(location.search).get('example') || 'alpine';
}

function readOptimizationConfig(params) {
  const num = (k, dflt) => {
    const v = params.get(k);
    if (v == null || v === '') return dflt;
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : dflt;
  };
  const bool = (k, dflt = true) => {
    if (params.get(k) === '1') return true;
    if (params.get(k) === '0') return false;
    return dflt;
  };
  const disabled = (k) => params.has(`no${k}`);

  return {
    enableJit: !disabled('jit') && bool('jit', true),
    jitTierEnabled: !disabled('tier') && bool('tier', true),
    timesliceResumeEnabled: !disabled('resume') && bool('resume', true),
    jitPrewarmEnabled: !disabled('prewarm') && bool('prewarm', true),
    jitAwaitCompiler: bool('awaitcompiler', false),
    jitMarkovEnabled: !disabled('markov') && bool('markov', true),
    jitTripletEnabled: !disabled('triplet') && bool('triplet', true),
    jitTraceEnabled: !disabled('trace') && bool('trace', true),
    jitHotThreshold: num('jithot', 16),
    jitOptimizeThreshold: num('jitopt', 64),
    jitSchedulerBudget: num('jitbudget', 32),
    jitSchedulerConcurrency: num('jitconcurrency', 2),
    jitSchedulerQueueMax: num('jitqmax', 128),
    jitPredictTopK: num('jitk', 4),
    jitPredictConfidence: num('jitconf', 60),
    jitEdgeHotThreshold: num('jitedge', 8),
    jitTraceTripletHotThreshold: num('jittriplet', 6),
  };
}

function setActiveTab(name) {
  for (const el of tabEls) el.classList.toggle('active', el.dataset.example === name);
}

function queueInput(text) {
  const bytes = new TextEncoder().encode(text);
  for (const b of bytes) stdinQueue.push(b);
}

function queueBytes(bytes) {
  for (const b of bytes) stdinQueue.push(b);
}

function sanitizeTerminalOutput(text) {
  const DSR_QUERY = '\x1b[6n';
  let combined = stdoutCarry + text;
  stdoutCarry = '';

  let idx = combined.indexOf(DSR_QUERY);
  while (idx !== -1) {
    // Respond with cursor position report so shells waiting on DSR can continue.
    queueBytes([0x1b, 0x5b, 0x31, 0x3b, 0x31, 0x52]); // ESC [ 1 ; 1 R
    combined = combined.slice(0, idx) + combined.slice(idx + DSR_QUERY.length);
    idx = combined.indexOf(DSR_QUERY);
  }

  // Preserve partial ESC sequence at chunk boundary.
  const parts = ['\x1b', '\x1b[', '\x1b[6'];
  for (const p of parts) {
    if (combined.endsWith(p)) {
      stdoutCarry = p;
      combined = combined.slice(0, -p.length);
      break;
    }
  }
  return combined;
}

function checkStdinRequest() {
  if (!controlView || !controlBytes) return;
  if (Atomics.load(controlView, 0) !== CMD_STDIN_REQUEST) return;
  if (expectsInput && !inputReady) {
    inputReady = true;
    setInputEnabled(true);
    setStatus(`running:${currentExample}`);
    setBoot(`boot: running ${currentExample} (stdin ready)`);
  }
  if (stdinQueue.length === 0) return;

  const maxLen = Math.max(1, Atomics.load(controlView, 2) || 1);
  const n = Math.min(maxLen, stdinQueue.length, 3968);
  for (let i = 0; i < n; i++) controlBytes[64 + i] = stdinQueue.shift();
  Atomics.store(controlView, 2, n);
  Atomics.store(controlView, 0, CMD_STDIN_READY);
  Atomics.notify(controlView, 0);
}

function drainStdout() {
  if (!stdoutView || !stdoutBytes) return;
  let writeHead = Atomics.load(stdoutView, 0);
  let readTail = Atomics.load(stdoutView, 1);
  if (writeHead === readTail) return;

  let out = '';
  while (readTail !== writeHead) {
    const b = stdoutBytes[RING_HEADER + readTail];
    out += String.fromCharCode(b);
    readTail = (readTail + 1) % RING_SIZE;
  }
  Atomics.store(stdoutView, 1, readTail);
  if (!out) return;
  const clean = sanitizeTerminalOutput(out);
  if (clean) {
    writeTerm(clean);
    if (expectsInput && !inputReady) {
      const tail = termEl.textContent.slice(-8);
      if (tail.includes('> ')) {
        inputReady = true;
        setInputEnabled(true);
        setStatus(`running:${currentExample}`);
        setBoot(`boot: running ${currentExample} (stdin ready)`);
      }
    }
  }
  checkStdinRequest();
}

function checkExit() {
  if (!controlView) return false;
  if (Atomics.load(controlView, 0) !== CMD_EXIT) return false;
  const code = Atomics.load(controlView, 5);
  setStatus(`exit:${code}`);
  Atomics.store(controlView, 0, CMD_IDLE);
  return true;
}

async function fetchArrayBuffer(url, label) {
  setBoot(`boot: downloading ${label}...`);
  const resp = await fetch(url, { cache: 'no-store' });
  if (!resp.ok) throw new Error(`${label} fetch failed: HTTP ${resp.status}`);
  return await resp.arrayBuffer();
}

async function boot() {
  const manifest = await fetch('./manifest.json', { cache: 'no-store' }).then(r => r.json());
  const params = new URLSearchParams(location.search);
  const exampleName = activeExample();
  const cfg = manifest.examples[exampleName];
  if (!cfg) throw new Error(`unknown example: ${exampleName}`);
  const opt = readOptimizationConfig(params);
  currentExample = exampleName;
  expectsInput = exampleName !== 'server';
  inputReady = false;
  setInputEnabled(!expectsInput);

  setActiveTab(exampleName);
  setStatus(`booting:${exampleName}`);
  setBoot(`boot: preparing ${cfg.image}`);

  const ckptParam = params.get('ckpt');
  const ckptUrl = ckptParam === 'none' ? null : (ckptParam || cfg.checkpoint || null);

  const [rootfs, checkpoint] = await Promise.all([
    fetchArrayBuffer(cfg.rootfs, `${exampleName} rootfs`),
    ckptUrl ? fetchArrayBuffer(ckptUrl, `${exampleName} checkpoint`) : Promise.resolve(null),
  ]);

  const allowNetwork = cfg.allowNetwork === true && !params.has('nonet');
  const netSab = allowNetwork ? new SharedArrayBuffer(65536) : null;
  const proxyUrl = params.get('proxy') || `https://${location.hostname}:4433/connect`;
  const proxyCertHash = params.get('certHash') || '';

  const controlSab = new SharedArrayBuffer(4096);
  const stdoutSab = new SharedArrayBuffer(65536);
  controlView = new Int32Array(controlSab);
  controlBytes = new Uint8Array(controlSab);
  stdoutView = new Int32Array(stdoutSab);
  stdoutBytes = new Uint8Array(stdoutSab);

  if (worker) worker.terminate();
  if (netRpcHost) {
    netRpcHost.stop();
    netRpcHost = null;
  }
  netBridge = null;
  worker = new Worker('/docs_site/worker.js', { type: 'module' });
  installDebugHooks();

  const ready = new Promise((resolve, reject) => {
    let settled = false;
    worker.onmessage = (e) => {
      if (e.data?.type === 'ready') {
        if (!settled) {
          settled = true;
          resolve();
        }
        return;
      }
      if (e.data?.type === 'error') {
        if (!settled) {
          settled = true;
          reject(new Error(e.data.message || 'worker error'));
        }
        return;
      }
      if (e.data?.type === 'net_ready') {
        setBoot(`boot: network lane ready (${proxyUrl})`);
        return;
      }
      if (e.data?.type === 'net_error') {
        writeTerm(`\r\n[net] lane error: ${e.data.message || 'unknown'}\r\n`);
        setBoot('boot: network lane failed');
      }
    };
    worker.onerror = (e) => reject(new Error(e.message || 'worker failed'));
  });

  worker.postMessage({
    type: 'init',
    controlSab,
    stdoutSab,
    netSab,
    allowNetwork,
    enableJit: opt.enableJit,
    jitTierEnabled: opt.jitTierEnabled,
    timesliceResumeEnabled: opt.timesliceResumeEnabled,
    jitPrewarmEnabled: opt.jitPrewarmEnabled,
    jitAwaitCompiler: opt.jitAwaitCompiler,
    jitMarkovEnabled: opt.jitMarkovEnabled,
    jitTripletEnabled: opt.jitTripletEnabled,
    jitTraceEnabled: opt.jitTraceEnabled,
    jitHotThreshold: opt.jitHotThreshold,
    jitOptimizeThreshold: opt.jitOptimizeThreshold,
    jitSchedulerBudget: opt.jitSchedulerBudget,
    jitSchedulerConcurrency: opt.jitSchedulerConcurrency,
    jitSchedulerQueueMax: opt.jitSchedulerQueueMax,
    jitPredictTopK: opt.jitPredictTopK,
    jitPredictConfidence: opt.jitPredictConfidence,
    jitEdgeHotThreshold: opt.jitEdgeHotThreshold,
    jitTraceTripletHotThreshold: opt.jitTraceTripletHotThreshold,
  });
  await ready;
  if (allowNetwork) {
    let bridgeForHost = null;
    try {
      bridgeForHost = new FriscyNetworkBridge(proxyUrl, { certHash: proxyCertHash || null });
      await Promise.race([
        bridgeForHost.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('proxy connect timeout')), 10000)),
      ]);
      setBoot(`boot: network bridge connected (${proxyUrl})`);
    } catch (e) {
      writeTerm(`\r\n[net] bridge unavailable: ${(e && e.message) || e}\r\n`);
      setBoot('boot: network bridge unavailable (socket calls return ENOTCONN)');
      // Stub bridge so socket syscalls fail fast instead of hanging.
      bridgeForHost = {
        socketCreate: async () => 0,
        socketConnect: async () => -107,
        socketBind: async () => -107,
        socketListen: async () => -107,
        socketAccept: async () => ({ result: -11, addr: null }),
        socketSend: async () => -107,
        socketRecv: async () => null,
        socketClose: async () => 0,
        socketHasData: async () => 0,
        socketHasPendingAccept: async () => 0,
        socketShutdown: async () => 0,
      };
    }
    netBridge = bridgeForHost;
    netRpcHost = new NetworkRPCHost(netSab, bridgeForHost, { laneEnabled: false });
    netRpcHost.start();
  }

  setBoot(`boot: launching guest ${cfg.image}`);
  const entry = Array.isArray(cfg.entrypoint) ? cfg.entrypoint : String(cfg.entrypoint || '').split(' ');
  const mergedEnv = [...(manifest.env || []), ...(cfg.env || [])];
  const envArgs = mergedEnv.flatMap((e) => ['--env', e]);
  const args = [...envArgs, '--rootfs', '/rootfs.tar', ...entry];
  const msg = {
    type: 'run',
    args,
    rootfsData: rootfs,
  };
  const transfers = [rootfs];
  if (checkpoint) {
    msg.checkpointData = checkpoint;
    transfers.push(checkpoint);
  }
  worker.postMessage(msg, transfers);

  if (pollId) clearInterval(pollId);
  pollId = setInterval(() => {
    drainStdout();
    checkStdinRequest();
    checkExit();
  }, 8);

  if (!expectsInput) {
    setStatus(`running:${exampleName}`);
    setBoot(`boot: running ${cfg.image}${allowNetwork ? ' (network on)' : ''}`);
  } else {
    setStatus(`running:${exampleName}`);
    setBoot(`boot: launching ${cfg.image} (waiting for stdin)`);
    // Event-loop based REPLs may not issue a blocking stdin request. Keep input
    // enabled so stdin can be pushed proactively.
    setInputEnabled(true);
  }
}

sendEl.addEventListener('click', () => {
  const value = cmdEl.value;
  if (!value) return;
  // Use CRLF so both tty-style shells and simple line readers commit input.
  queueInput(value + '\r\n');
  cmdEl.value = '';
  checkStdinRequest();
});

cmdEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    sendEl.click();
  }
});

for (const tab of tabEls) {
  tab.addEventListener('click', () => {
    const ex = tab.dataset.example;
    const u = new URL(location.href);
    if (ex === 'alpine') u.searchParams.delete('example');
    else u.searchParams.set('example', ex);
    location.href = u.toString();
  });
}

boot().catch((e) => {
  setStatus('error');
  setBoot(`boot: failed (${e.message})`);
  writeTerm(`\n[golden-demo] boot error: ${e.message}\n`);
});
