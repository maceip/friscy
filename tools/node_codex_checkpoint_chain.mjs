#!/usr/bin/env node
import puppeteer from 'puppeteer';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

let port = 9096;
function hasNamedKeyInDotenv(name) {
  try {
    const raw = readFileSync(resolve('.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      if (new RegExp(`^${name}\\s*=`).test(trimmed)) return true;
    }
  } catch {}
  return false;
}

function readApiKeyFromDotenv() {
  const keys = ['OPENAI_API_KEY'];
  try {
    const raw = readFileSync(resolve('.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      for (const key of keys) {
        const m = trimmed.match(new RegExp(`^${key}\\s*=\\s*(.*)$`));
        if (!m) continue;
        let v = m[1].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (v) return v;
      }
    }
  } catch {}
  return '';
}

let apiKey = process.env.OPENAI_API_KEY || readApiKeyFromDotenv();
let reportPath = resolve('docs', 'generated', 'node_codex_checkpoint_chain_report.json');
const outDir = resolve('docs_site');
const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY || hasNamedKeyInDotenv('OPENAI_API_KEY'));
let offlineOnly = process.env.CODEX_OFFLINE_ONLY === '1' || !hasOpenAIKey;

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) port = Number(args[++i]);
  else if (args[i] === '--api-key' && args[i + 1]) apiKey = args[++i];
  else if (args[i] === '--report' && args[i + 1]) reportPath = resolve(args[++i]);
  else if (args[i] === '--offline-only') offlineOnly = true;
}

if (!apiKey) {
  if (offlineOnly) {
    apiKey = 'offline-dummy-key';
  } else {
    console.error('[chain] Missing OPENAI_API_KEY / --api-key');
    process.exit(1);
  }
}

const BASE = `http://127.0.0.1:${port}`;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function withTimeout(promise, ms, label) {
  let timeoutId = null;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

function isTransientPageError(error) {
  const msg = error && error.message ? error.message : String(error || '');
  return msg.includes('Execution context was destroyed')
    || msg.includes('Cannot find context with specified id')
    || msg.includes('Attempted to use detached Frame')
    || msg.includes('Navigating frame was detached')
    || msg.includes('page.evaluate timeout');
}

async function safeEval(page, fn, ...args) {
  const deadline = Date.now() + 60000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      return await Promise.race([
        page.evaluate(fn, ...args),
        new Promise((_, reject) => setTimeout(() => reject(new Error('page.evaluate timeout')), 20000)),
      ]);
    } catch (error) {
      if (!isTransientPageError(error)) throw error;
      lastError = error;
      await sleep(250);
    }
  }
  throw lastError || new Error('safeEval timeout');
}

async function ensurePrompt(page, apiKeyText, timeoutMs = 600000) {
  const deadline = Date.now() + timeoutMs;
  let phase = 'none';
  let lastLog = 0;
  while (Date.now() < deadline) {
    phase = await safeEval(page, () => window._friscy?.phase || 'none');
    const elapsed = timeoutMs - (deadline - Date.now());
    if (elapsed - lastLog >= 5000) {
      lastLog = elapsed;
      console.log(`[chain] ensurePrompt phase=${phase} elapsed=${elapsed}ms`);
    }
    if (phase === 'apikey' || phase === 'prompt') break;
    await sleep(250);
  }
  if (phase !== 'apikey' && phase !== 'prompt') {
    throw new Error('timeout waiting for apikey/prompt phase');
  }
  if (phase === 'apikey') {
    await safeEval(page, (k) => window.term?.paste(`${k || ''}\r`), apiKeyText || '');
  }
  while (Date.now() < deadline) {
    phase = await safeEval(page, () => window._friscy?.phase || 'none');
    if (phase === 'prompt') return;
    await sleep(250);
  }
  throw new Error('timeout waiting for prompt phase');
}

async function runCommand(page, cmd, timeoutMs = 1200000) {
  const beforeLen = await safeEval(page, () => (window._friscy?.rawOutputBuf || '').length);
  await safeEval(page, (c) => window.term?.paste(`${c}\r`), cmd);
  const t0 = Date.now();
  let sawWorking = false;
  let sawNonPrompt = false;
  let lastLogMs = 0;
  let lastTail = '';
  let lastLen = beforeLen;

  while (Date.now() - t0 < timeoutMs) {
    const state = await safeEval(page, () => ({
      phase: window._friscy?.phase || 'none',
      rawLen: (window._friscy?.rawOutputBuf || '').length,
      rawTail: (window._friscy?.rawOutputBuf || '').slice(-1200),
    }));
    lastTail = state.rawTail || '';
    lastLen = state.rawLen || beforeLen;
    const elapsed = Date.now() - t0;
    if (elapsed - lastLogMs >= 5000) {
      lastLogMs = elapsed;
      console.log(
        `[chain] cmd progress phase=${state.phase} elapsed=${elapsed}ms textDelta=${(state.rawLen || 0) - beforeLen} ` +
        `working=${sawWorking} nonPrompt=${sawNonPrompt}`
      );
    }
    if (state.phase === 'working' || state.phase === 'streaming') sawWorking = true;
    if (state.phase !== 'prompt') sawNonPrompt = true;
    if (state.phase === 'prompt' && elapsed > 1000) {
      const hasOutputDelta = (state.rawLen || 0) > beforeLen + 8;
      if (!(hasOutputDelta || sawWorking || sawNonPrompt)) {
        await sleep(250);
        continue;
      }
      return {
        ok: true,
        elapsedMs: elapsed,
        delta: lastTail,
      };
    }
    await sleep(250);
  }
  return { ok: false, elapsedMs: Date.now() - t0, delta: lastTail || '', deltaBytes: Math.max(0, lastLen - beforeLen) };
}

function assertCommandSucceeded(result, label) {
  const text = (result.delta || '').replace(/\s+/g, ' ');
  if (/Command failed \(exit \d+\)/.test(text)) {
    throw new Error(`${label} failed: ${text.slice(0, 300)}`);
  }
}

function assertNoCodexAuthError(result, label) {
  const text = (result.delta || '').replace(/\s+/g, ' ');
  if (/OPENAI_API_KEY/i.test(text) || /invalid api key/i.test(text) || /Incorrect API key/i.test(text)) {
    throw new Error(`${label} failed auth: ${text.slice(0, 300)}`);
  }
}

async function exportCheckpoint(page, filename) {
  const t0 = Date.now();
  const minReasonableBytes = 16 * 1024 * 1024;

  // Preferred path: upload directly to docs_site via /__upload_checkpoint
  // to avoid flaky browser download behavior in headless runs.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const phase = await safeEval(page, () => window._friscy?.phase || 'none');
      console.log(`[chain] export ${filename}: begin (phase=${phase}, attempt=${attempt})`);
      const uploaded = await withTimeout(safeEval(
        page,
        async (name) => {
          const timeoutMs = 300000;
          return Promise.race([
            window._friscy?.exportLiveCheckpointUpload?.(name),
            new Promise((_, reject) => setTimeout(() => reject(new Error('exportLiveCheckpointUpload timeout')), timeoutMs)),
          ]);
        },
        filename,
      ), 360000, `checkpoint upload ${filename}`);
      const uploadedPath = uploaded?.result?.path || `./${filename}`;
      const absPath = resolve(outDir, uploadedPath.replace(/^\.\//, ''));
      if (existsSync(absPath)) {
        const size = statSync(absPath).size;
        if (size < minReasonableBytes) {
          throw new Error(`checkpoint file too small (${size} bytes)`);
        }
        console.log(`[chain] export ${filename}: done (${Date.now() - t0}ms, size=${size})`);
        return { path: absPath, ms: Date.now() - t0 };
      }
      throw new Error(`uploaded checkpoint path missing: ${absPath}`);
    } catch (e) {
      const absPath = resolve(outDir, filename);
      if (existsSync(absPath)) {
        const size = statSync(absPath).size;
        if (size >= minReasonableBytes) {
          console.log(`[chain] export ${filename}: accepted existing file after error (size=${size})`);
          return { path: absPath, ms: Date.now() - t0 };
        }
      }
      if (attempt < 2) {
        console.log(`[chain] export ${filename}: retry after error: ${e?.message || e}`);
        await sleep(1500);
        continue;
      }
      throw new Error(`checkpoint export failed for ${filename}: ${e?.message || e}`);
    }
  }
}

async function bootPage(page, ckpt = null) {
  const cb = Date.now();
  const query = ckpt
    ? `?example=codex&nosw=1&noautockpt=1&ckpt=${encodeURIComponent('./' + ckpt)}&cb=${cb}`
    : `?example=codex&nosw=1&noautockpt=1&cb=${cb}`;
  const t0 = Date.now();
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.goto(`${BASE}/claude-demo.html${query}`, { waitUntil: 'networkidle2', timeout: 180000 });
      await ensurePrompt(page, apiKey, 600000);
      return Date.now() - t0;
    } catch (error) {
      lastError = error;
      console.log(`[chain] boot retry ${attempt}/3 failed: ${error?.message || error}`);
      if (attempt < 3) await sleep(1500);
    }
  }
  throw lastError || new Error('bootPage failed');
}

async function main() {
  try { mkdirSync(resolve('docs', 'generated'), { recursive: true }); } catch {}

  const report = {
    ok: false,
    port,
    startedAt: new Date().toISOString(),
    offlineOnly,
    checkpoints: {},
    timings: {},
    steps: [],
    error: null,
    logTail: [],
  };

  const browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: 60 * 60 * 1000,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-service-worker',
      '--enable-features=SharedArrayBuffer',
      '--enable-features=WebAssemblyExnRef',
    ],
  });
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await page.setBypassServiceWorker(true);
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', { behavior: 'deny' });

  try {
    console.log('[chain] boot base');
    report.steps.push('boot: base codex');
    report.timings.bootBaseMs = await bootPage(page, null);

    const probeCmd = '__CODEX_PROBE__';
    console.log('[chain] run: codex install probe');
    report.steps.push('cmd: codex install probe');
    const probe = await runCommand(page, probeCmd, 300000);
    report.timings.installProbeMs = probe.elapsedMs;
    report.installProbePreview = (probe.delta || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!probe.ok) throw new Error('codex install probe did not complete');
    assertCommandSucceeded(probe, 'codex install probe');

    console.log('[chain] checkpoint: post-probe');
    report.steps.push('checkpoint: post-probe');
    const c1 = await exportCheckpoint(page, 'codex-version-post.ckpt');
    report.checkpoints.postVersion = c1.path;
    report.timings.checkpointPostVersionMs = c1.ms;

    console.log('[chain] boot: post-version');
    report.steps.push('boot: post-version');
    report.timings.bootPostVersionMs = await bootPage(page, 'codex-version-post.ckpt');

    const haikuCmd = offlineOnly ? 'codex --help' : "codex e 'write me a haiku'";
    console.log(`[chain] run: ${offlineOnly ? 'help' : 'haiku'}`);
    report.steps.push(`cmd: ${offlineOnly ? 'help' : 'haiku'}`);
    const haiku = await runCommand(page, haikuCmd, 1200000);
    report.timings.haikuMs = haiku.elapsedMs;
    report.haikuPreview = (haiku.delta || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!haiku.ok) throw new Error('haiku command did not complete');
    assertCommandSucceeded(haiku, offlineOnly ? 'help' : 'haiku');
    if (!offlineOnly) assertNoCodexAuthError(haiku, 'haiku');

    console.log('[chain] checkpoint: post-haiku');
    report.steps.push('checkpoint: post-haiku');
    const c2 = await exportCheckpoint(page, 'codex-haiku.ckpt');
    report.checkpoints.postHaiku = c2.path;
    report.timings.checkpointPostHaikuMs = c2.ms;

    console.log('[chain] boot: post-haiku');
    report.steps.push('boot: post-haiku');
    report.timings.bootPostHaikuMs = await bootPage(page, 'codex-haiku.ckpt');

    const limCmd = offlineOnly ? 'codex --help' : "codex e 'write me a limerick'";
    console.log(`[chain] run: ${offlineOnly ? 'help' : 'limerick'}`);
    report.steps.push(`cmd: ${offlineOnly ? 'help' : 'limerick'}`);
    const lim = await runCommand(page, limCmd, 1200000);
    report.timings.limerickMs = lim.elapsedMs;
    report.limerickPreview = (lim.delta || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!lim.ok) throw new Error('limerick command did not complete');
    assertCommandSucceeded(lim, offlineOnly ? 'help' : 'limerick');
    if (!offlineOnly) assertNoCodexAuthError(lim, 'limerick');

    console.log('[chain] checkpoint: post-limerick');
    report.steps.push('checkpoint: post-limerick');
    const c3 = await exportCheckpoint(page, 'codex-limerick.ckpt');
    report.checkpoints.postLimerick = c3.path;
    report.timings.checkpointPostLimerickMs = c3.ms;

    report.ok = true;
  } catch (e) {
    report.error = e?.message || String(e);
  } finally {
    report.logTail = logs.slice(-160);
    report.finishedAt = new Date().toISOString();
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    await browser.close();
  }

  console.log(JSON.stringify({
    ok: report.ok,
    steps: report.steps,
    checkpoints: report.checkpoints,
    timings: report.timings,
    report: reportPath,
    error: report.error,
  }, null, 2));

  if (!report.ok) process.exit(1);
}

main().catch((e) => {
  console.error('[chain] fatal', e);
  process.exit(1);
});
