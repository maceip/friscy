#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const PORT = Number(process.env.FRISCY_PORT || 9010);
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = process.cwd();
const BUNDLE_DIR = path.join(ROOT, 'friscy-bundle');

const VERSION_CKPT = path.join(BUNDLE_DIR, 'claude-version-post.ckpt');
const STDIN_CKPT = path.join(BUNDLE_DIR, 'claude-stdin-post.ckpt');
const POEM_CKPT = path.join(BUNDLE_DIR, 'claude-poem-post.ckpt');
const SKIP_VERSION = process.argv.includes('--skip-version');
const FORCE_VERSION = process.argv.includes('--force-version');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(fn, timeoutMs, intervalMs = 500, label = 'condition') {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await fn();
    if (ok) return true;
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for ${label} after ${timeoutMs}ms`);
}

function fileInfo(p) {
  try {
    const st = fs.statSync(p);
    return { exists: true, bytes: st.size, mtimeMs: st.mtimeMs };
  } catch {
    return { exists: false, bytes: 0, mtimeMs: 0 };
  }
}

async function bootExample(page, example) {
  const url = `${BASE}/?example=${encodeURIComponent(example)}&process_events=1`;
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 300000 });
  await waitFor(
    () => page.evaluate(() => Boolean(window._friscyStdinQueue && window._friscyExportLiveCheckpointUpload)),
    300000,
    500,
    `friscy hooks (${example})`
  );
  await sleep(20000);
}

async function sendInput(page, text) {
  await page.evaluate((payload) => {
    const q = window._friscyStdinQueue;
    if (!q) throw new Error('stdin queue missing');
    const bytes = new TextEncoder().encode(payload);
    for (const b of bytes) q.push(b);
  }, text);
}

async function waitForShellInput(page, timeoutMs = 120000) {
  return await page.evaluate(async (t) => {
    if (typeof window._friscyAwaitStdinRequest !== 'function') return false;
    return await window._friscyAwaitStdinRequest(t);
  }, timeoutMs);
}

async function exportCheckpoint(page, filename) {
  return await page.evaluate(async (name) => {
    const res = await window._friscyExportLiveCheckpointUpload(name);
    return res;
  }, filename);
}

function pickBestResumeCheckpoint() {
  const poem = fileInfo(POEM_CKPT);
  const version = fileInfo(VERSION_CKPT);
  if (poem.exists && poem.mtimeMs >= version.mtimeMs) {
    return { source: POEM_CKPT, label: 'poem' };
  }
  return { source: VERSION_CKPT, label: 'version' };
}

async function collectEvents(page) {
  return await page.evaluate(() => Array.isArray(window.__friscyProcessEventLog) ? window.__friscyProcessEventLog : []);
}

function hasLiveSpawn(events, sinceIdx) {
  const spawned = new Set();
  const exited = new Set();
  for (const ev of events.slice(sinceIdx)) {
    if (ev.kind === 1 && Number.isInteger(ev.pid)) spawned.add(ev.pid);
    if (ev.kind === 2 && Number.isInteger(ev.pid)) exited.add(ev.pid);
  }
  for (const pid of spawned) {
    if (!exited.has(pid)) return true;
  }
  return false;
}

async function run() {
  console.log(`[webshell] BASE=${BASE}`);
  console.log(`[webshell] existing version checkpoint:`, fileInfo(VERSION_CKPT));

  const browser = await puppeteer.launch({
    headless: 'new',
    protocolTimeout: 60 * 60 * 1000,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--enable-features=WebTransport,WebAssemblyExperimentalJSPI',
      '--enable-experimental-web-platform-features',
    ],
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(60 * 60 * 1000);

  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('checkpoint') || text.includes('resume') || text.includes('[worker]') || text.includes('startup failed')) {
      console.log(`[console:${msg.type()}] ${text}`);
    }
  });
  page.on('pageerror', (err) => {
    console.log(`[pageerror] ${err.message}`);
  });

  try {
    if (!SKIP_VERSION && !FORCE_VERSION) {
      const best = pickBestResumeCheckpoint();
      if (best.label === 'poem' && fs.existsSync(VERSION_CKPT)) {
        console.log('[webshell] auto-skip version step: newer poem checkpoint already available');
      }
    }

    if (!SKIP_VERSION && (FORCE_VERSION || pickBestResumeCheckpoint().label !== 'poem')) {
      console.log('[webshell] step1 boot claude-tui and run "claude --version"');
      await bootExample(page, 'claude-tui');
      await waitForShellInput(page, 120000);
      await sendInput(page, 'claude --version\n');
      await sleep(15000);

      const beforeVersion = fileInfo(VERSION_CKPT);
      const uploadedVersion = await exportCheckpoint(page, 'claude-version-post.ckpt');
      const afterVersion = fileInfo(VERSION_CKPT);
      console.log('[webshell] uploaded version checkpoint:', uploadedVersion);
      console.log('[webshell] version checkpoint file:', beforeVersion, '->', afterVersion);
    } else {
      console.log('[webshell] step1 skipped; reusing existing checkpoint');
    }

    const bestResume = pickBestResumeCheckpoint();
    if (bestResume.source !== VERSION_CKPT && fs.existsSync(bestResume.source)) {
      fs.copyFileSync(bestResume.source, VERSION_CKPT);
      console.log(`[webshell] promoted ${bestResume.label} checkpoint -> claude-version-post.ckpt for faster resume`);
    }

    console.log('[webshell] step2 boot claude-resume and attempt bare "claude" (max 22)');
    await bootExample(page, 'claude-resume');

    let success = false;
    let attempt = 0;
    for (attempt = 1; attempt <= 22; attempt++) {
      const beforeEvents = await collectEvents(page);
      const idx = beforeEvents.length;
      console.log(`[webshell] bare claude attempt ${attempt}/22`);
      await waitForShellInput(page, 120000);
      await sendInput(page, 'claude\n');
      await sleep(25000);
      const events = await collectEvents(page);
      const looksAlive = hasLiveSpawn(events, idx);
      console.log(`[webshell] attempt ${attempt}: newEvents=${events.length - idx} looksAlive=${looksAlive}`);

      if (looksAlive) {
        success = true;
        break;
      }

      await sendInput(page, '\u0003');
      await sleep(1500);
      await sendInput(page, '\n');
      await sleep(1500);
    }

    if (success) {
      console.log(`[webshell] bare claude accepted on attempt ${attempt}; exporting stdin checkpoint`);
      const beforeStdin = fileInfo(STDIN_CKPT);
      const uploadedStdin = await exportCheckpoint(page, 'claude-stdin-post.ckpt');
      const afterStdin = fileInfo(STDIN_CKPT);
      console.log('[webshell] uploaded stdin checkpoint:', uploadedStdin);
      console.log('[webshell] stdin checkpoint file:', beforeStdin, '->', afterStdin);
    } else {
      console.log('[webshell] bare claude did not stabilize in 22 attempts; running fallback claude -p');
      await waitForShellInput(page, 120000);
      await sendInput(page, 'claude -p "write me a poem"\n');
      await sleep(45000);

      const beforePoem = fileInfo(POEM_CKPT);
      const uploadedPoem = await exportCheckpoint(page, 'claude-poem-post.ckpt');
      const afterPoem = fileInfo(POEM_CKPT);
      console.log('[webshell] uploaded poem checkpoint:', uploadedPoem);
      console.log('[webshell] poem checkpoint file:', beforePoem, '->', afterPoem);
    }

    const final = {
      version: fileInfo(VERSION_CKPT),
      stdin: fileInfo(STDIN_CKPT),
      poem: fileInfo(POEM_CKPT),
    };
    console.log('[webshell] final checkpoint status:', final);
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('[webshell] fatal:', err?.stack || err?.message || String(err));
  process.exit(1);
});
