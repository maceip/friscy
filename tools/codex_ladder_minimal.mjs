#!/usr/bin/env node
import puppeteer from 'puppeteer';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
let port = 9096;
let checkpointName = 'codex-min-post-marker.ckpt';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) port = Number(args[++i]);
  else if (args[i] === '--checkpoint' && args[i + 1]) checkpointName = args[++i];
}

function readKey() {
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim()) return process.env.OPENAI_API_KEY.trim();
  try {
    const raw = readFileSync(resolve('.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^OPENAI_API_KEY\s*=\s*(.*)$/);
      if (!m) continue;
      let v = m[1].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (v) return v;
    }
  } catch {}
  return 'offline-dummy-key';
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function sanitizeForSummary(text) {
  return String(text || '')
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(-500);
}

async function withTimeout(promise, ms, label) {
  let timeoutId = null;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function isTransientPageError(error) {
  const msg = error?.message || String(error || '');
  return msg.includes('Execution context was destroyed')
    || msg.includes('Cannot find context with specified id')
    || msg.includes('Attempted to use detached Frame')
    || msg.includes('Navigating frame was detached')
    || msg.includes('page.evaluate timeout');
}

async function safeEval(page, fn, ...fnArgs) {
  const deadline = Date.now() + 60000;
  let last = null;
  while (Date.now() < deadline) {
    try {
      return await Promise.race([
        page.evaluate(fn, ...fnArgs),
        new Promise((_, reject) => setTimeout(() => reject(new Error('page.evaluate timeout')), 20000)),
      ]);
    } catch (e) {
      if (!isTransientPageError(e)) throw e;
      last = e;
      await sleep(200);
    }
  }
  throw last || new Error('safeEval timeout');
}

async function waitForPhase(page, allowed, timeoutMs, label) {
  const t0 = Date.now();
  let last = 0;
  while (Date.now() - t0 < timeoutMs) {
    const phase = await safeEval(page, () => window._friscy?.phase || 'none');
    if (allowed.includes(phase)) return phase;
    if (Date.now() - last > 5000) {
      last = Date.now();
      console.log(`[gate] ${label}: phase=${phase} elapsed=${Date.now() - t0}ms`);
    }
    await sleep(200);
  }
  const finalPhase = await safeEval(page, () => window._friscy?.phase || 'none');
  throw new Error(`${label} timeout lastPhase=${finalPhase}`);
}

async function ensurePrompt(page, apiKey) {
  let phase = await waitForPhase(page, ['apikey', 'prompt'], 600000, 'wait boot');
  if (phase === 'apikey') {
    await safeEval(page, (k) => window.term?.paste(`${k}\r`), apiKey);
    await waitForPhase(page, ['prompt'], 180000, 'wait prompt after key');
  }
}

async function boot(page, ckpt = null) {
  const cb = Date.now();
  const query = ckpt
    ? `?example=codex&nosw=1&noautockpt=1&ckpt=${encodeURIComponent('./' + ckpt)}&cb=${cb}`
    : `?example=codex&nosw=1&noautockpt=1&cb=${cb}`;
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${port}/claude-demo.html${query}`, { waitUntil: 'networkidle2', timeout: 180000 });
  await ensurePrompt(page, readKey());
  await safeEval(page, () => {
    if (!window.__gateOrigTermWrite && window.term && typeof window.term.write === 'function') {
      window.__gateBuf = '';
      window.__gateOrigTermWrite = window.term.write.bind(window.term);
      window.term.write = (chunk) => {
        window.__gateBuf += String(chunk || '');
        return window.__gateOrigTermWrite(chunk);
      };
    }
    window.__gateMark = (window.__gateBuf || '').length;
  });
  return Date.now() - t0;
}

async function runCommand(page, cmd, timeoutMs = 180000) {
  await safeEval(page, () => {
    window.__gateMark = (window.__gateBuf || '').length;
  });

  await safeEval(page, (c) => window.term?.paste(`${c}\r`), cmd);

  const leavePhase = await waitForPhase(page, ['working', 'streaming', 'slash', 'login_wait', 'prompt'], 20000, `leave prompt: ${cmd}`);
  if (leavePhase === 'prompt') {
    await sleep(600);
  } else {
    await waitForPhase(page, ['prompt'], timeoutMs, `return prompt: ${cmd}`);
  }

  const payload = await safeEval(page, () => {
    const buf = window.__gateBuf || '';
    const start = window.__gateMark || 0;
    return { delta: buf.slice(start), phase: window._friscy?.phase || 'none' };
  });

  return {
    ok: payload.phase === 'prompt',
    phase: payload.phase,
    delta: payload.delta || '',
    summary: sanitizeForSummary(payload.delta || ''),
  };
}

async function exportCheckpoint(page, name) {
  const uploaded = await withTimeout(page.evaluate(async (n) => {
    return await Promise.race([
      window._friscy.exportLiveCheckpointUpload(n),
      new Promise((_, reject) => setTimeout(() => reject(new Error('upload timeout in page')), 300000)),
    ]);
  }, name), 360000, `export checkpoint ${name}`);

  if (!uploaded?.ok) throw new Error(`upload failed: ${JSON.stringify(uploaded)}`);
  const path = uploaded?.result?.path || `./${name}`;
  const abs = resolve('docs_site', path.replace(/^\.\//, ''));
  if (!existsSync(abs)) throw new Error(`checkpoint missing at ${abs}`);
  const size = statSync(abs).size;
  if (size < 16 * 1024 * 1024) throw new Error(`checkpoint too small (${size} bytes)`);
  return { path: abs, size };
}
function assertContains(text, needle, label) {
  if (!String(text || '').includes(needle)) {
    throw new Error(`${label} missing '${needle}': ${sanitizeForSummary(text)}`);
  }
}

async function main() {
  const result = {
    ok: false,
    port,
    checkpointName,
    timings: {},
    checks: {},
    checkpoint: null,
    error: null,
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

  try {
    console.log('[gate] boot fresh');
    result.timings.bootFreshMs = await boot(page, null);

    const versionCmd = "bash -lc 'codex --version'";
    const markerCmd = "bash -lc \"codex e 'Reply with exactly: MARK_CODEX_OK'\"";

    console.log('[gate] cmd fresh version');
    const freshVersion = await runCommand(page, versionCmd, 180000);
    if (!freshVersion.ok) throw new Error(`fresh version did not return to prompt (phase=${freshVersion.phase})`);
    assertContains(freshVersion.delta, 'codex fast-path', 'fresh version');
    result.checks.freshVersion = freshVersion.summary;

    console.log('[gate] cmd prompt marker');
    const marker = await runCommand(page, markerCmd, 180000);
    if (!marker.ok) throw new Error(`marker command did not return to prompt (phase=${marker.phase})`);
    assertContains(marker.delta, 'MARK_CODEX_OK', 'prompt marker');
    result.checks.promptMarker = marker.summary;

    console.log('[gate] export checkpoint');
    result.checkpoint = await exportCheckpoint(page, checkpointName);

    console.log('[gate] boot resume');
    result.timings.bootResumeMs = await boot(page, checkpointName);

    console.log('[gate] cmd resume version');
    const resumeVersion = await runCommand(page, versionCmd, 180000);
    if (!resumeVersion.ok) throw new Error(`resume version did not return to prompt (phase=${resumeVersion.phase})`);
    assertContains(resumeVersion.delta, 'codex fast-path', 'resume version');
    result.checks.resumeVersion = resumeVersion.summary;

    result.ok = true;
  } catch (e) {
    result.error = e?.message || String(e);
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}

main().catch((e) => {
  console.error('[gate] fatal', e);
  process.exit(1);
});
