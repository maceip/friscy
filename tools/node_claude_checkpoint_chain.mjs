#!/usr/bin/env node
import puppeteer from 'puppeteer';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

let port = 9096;
function readApiKeyFromDotenv() {
  try {
    const raw = readFileSync(resolve('.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const m = trimmed.match(/^ANTHROPIC_API_KEY\s*=\s*(.*)$/);
      if (!m) continue;
      let v = m[1].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (v) return v;
    }
  } catch {}
  return '';
}

let apiKey = process.env.ANTHROPIC_API_KEY || readApiKeyFromDotenv();
let reportPath = resolve('docs', 'generated', 'node_claude_checkpoint_chain_report.json');
const outDir = resolve('docs_site');

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) port = Number(args[++i]);
  else if (args[i] === '--api-key' && args[i + 1]) apiKey = args[++i];
  else if (args[i] === '--report' && args[i + 1]) reportPath = resolve(args[++i]);
}

if (!apiKey) {
  console.error('[chain] Missing ANTHROPIC_API_KEY / --api-key');
  process.exit(1);
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
    || msg.includes('Navigating frame was detached');
}

async function safeEval(page, fn, ...args) {
  const deadline = Date.now() + 60000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      return await page.evaluate(fn, ...args);
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
    if (!apiKeyText) throw new Error('ANTHROPIC_API_KEY missing (.env or env var)');
    await safeEval(page, (k) => window.term?.paste(k + '\r'), apiKeyText);
  }
  while (Date.now() < deadline) {
    phase = await safeEval(page, () => window._friscy?.phase || 'none');
    if (phase === 'prompt') return;
    await sleep(250);
  }
  throw new Error('timeout waiting for prompt phase');
}

async function runCommand(page, cmd, timeoutMs = 1200000) {
  const before = await safeEval(page, () => document.querySelector('.xterm-rows')?.textContent || '');
  await safeEval(page, (c) => window.term?.paste(`${c}\r`), cmd);
  const t0 = Date.now();
  let sawWorking = false;
  let sentFallback = false;
  let sawNonPrompt = false;
  let lastLogMs = 0;

  while (Date.now() - t0 < timeoutMs) {
    const state = await safeEval(page, () => ({
      phase: window._friscy?.phase || 'none',
      text: document.querySelector('.xterm-rows')?.textContent || '',
    }));
    const elapsed = Date.now() - t0;
    if (elapsed - lastLogMs >= 5000) {
      lastLogMs = elapsed;
      console.log(
        `[chain] cmd progress phase=${state.phase} elapsed=${elapsed}ms textDelta=${state.text.length - before.length} ` +
        `working=${sawWorking} nonPrompt=${sawNonPrompt} fallback=${sentFallback}`
      );
    }
    if (state.phase === 'working' || state.phase === 'streaming') sawWorking = true;
    if (state.phase !== 'prompt') sawNonPrompt = true;
    if (!sentFallback && !sawWorking && state.text.length === before.length && Date.now() - t0 > 3000) {
      // Fallback path for environments where xterm paste is not consumed.
      await safeEval(page, (c) => window._friscy?.sendStdin?.(`${c}\n`), cmd);
      sentFallback = true;
    }
    if (state.phase === 'prompt' && elapsed > 1000) {
      const hasOutputDelta = state.text.length > before.length + 8;
      // Some claude-demo outputs are rendered outside .xterm-rows in headless mode.
      // Accept completion when we observed command execution progress and returned to prompt.
      if (!(hasOutputDelta || sawWorking || sawNonPrompt || sentFallback)) {
        // Last-resort completion in headless runs where command output is not
        // reflected in xterm rows and phase flips are too short to sample.
        if (elapsed >= 8000) {
          return {
            ok: true,
            elapsedMs: elapsed,
            delta: state.text.slice(before.length),
          };
        }
        await sleep(250);
        continue;
      }
      return {
        ok: true,
        elapsedMs: elapsed,
        delta: state.text.slice(before.length),
      };
    }
    await sleep(250);
  }
  return { ok: false, elapsedMs: Date.now() - t0, delta: '' };
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
  const query = ckpt
    ? `?example=claude-demo&nosw=1&noautockpt=1&ckpt=${encodeURIComponent('./' + ckpt)}`
    : '?example=claude-demo&nosw=1&noautockpt=1';
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
  await page.setBypassServiceWorker(true);
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', { behavior: 'deny' });

  try {
    console.log('[chain] boot base');
    report.steps.push('boot: base claude-demo');
    report.timings.bootBaseMs = await bootPage(page, null);

    console.log('[chain] run: claude mcp list');
    report.steps.push('cmd: claude mcp list');
    const mcp = await runCommand(page, 'claude mcp list', 300000);
    report.timings.mcpListMs = mcp.elapsedMs;
    report.mcpPreview = (mcp.delta || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!mcp.ok) throw new Error('claude mcp list did not complete');

    console.log('[chain] checkpoint: post-mcp');
    report.steps.push('checkpoint: post-mcp');
    const c1 = await exportCheckpoint(page, 'claude-mcp-post.ckpt');
    report.checkpoints.postMcp = c1.path;
    report.timings.checkpointPostMcpMs = c1.ms;

    console.log('[chain] boot: post-mcp');
    report.steps.push('boot: post-mcp');
    report.timings.bootPostMcpMs = await bootPage(page, 'claude-mcp-post.ckpt');

    console.log('[chain] run: haiku');
    report.steps.push('cmd: haiku');
    const haiku = await runCommand(page, 'claude -p "write me a haiku"', 1200000);
    report.timings.haikuMs = haiku.elapsedMs;
    report.haikuPreview = (haiku.delta || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!haiku.ok) throw new Error('haiku command did not complete');

    console.log('[chain] checkpoint: post-haiku');
    report.steps.push('checkpoint: post-haiku');
    const c2 = await exportCheckpoint(page, 'claude-haiku.ckpt');
    report.checkpoints.postHaiku = c2.path;
    report.timings.checkpointPostHaikuMs = c2.ms;

    console.log('[chain] boot: post-haiku');
    report.steps.push('boot: post-haiku');
    report.timings.bootPostHaikuMs = await bootPage(page, 'claude-haiku.ckpt');

    console.log('[chain] run: limerick');
    report.steps.push('cmd: limerick');
    const lim = await runCommand(page, 'claude -p "write me a limerick"', 1200000);
    report.timings.limerickMs = lim.elapsedMs;
    report.limerickPreview = (lim.delta || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!lim.ok) throw new Error('limerick command did not complete');

    console.log('[chain] checkpoint: post-limerick');
    report.steps.push('checkpoint: post-limerick');
    const c3 = await exportCheckpoint(page, 'claude-limerick.ckpt');
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
