#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const PORT = Number(process.env.FRISCY_PORT || 9010);
const BASE = `http://127.0.0.1:${PORT}`;
const BUNDLE_DIR = path.join(process.cwd(), 'friscy-bundle');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(fn, timeoutMs, label, intervalMs = 250) {
  async function probeWithTimeout(ms) {
    return Promise.race([
      fn(),
      new Promise((resolve) => setTimeout(() => resolve(false), ms)),
    ]);
  }
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await probeWithTimeout(5000)) return;
    await sleep(intervalMs);
  }
  throw new Error(`timeout waiting for ${label}`);
}

async function bootExample(page, example) {
  await page.goto(`${BASE}/?example=${encodeURIComponent(example)}&nosw`, {
    waitUntil: 'networkidle2',
    timeout: 300000,
  });
  await waitFor(
    () => page.evaluate(() => Boolean(window._friscyStdinQueue && window._friscyExportLiveCheckpointUpload && window._friscyAwaitStdinRequest)),
    300000,
    `webshell hooks (${example})`,
  );
}

async function waitStdin(page, timeoutMs = 120000) {
  return Promise.race([
    page.evaluate(async (t) => {
      if (typeof window._friscyAwaitStdinRequest !== 'function') return false;
      return window._friscyAwaitStdinRequest(t);
    }, timeoutMs),
    new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs + 5000)),
  ]);
}

async function sendInput(page, text) {
  await Promise.race([
    page.evaluate((payload) => {
      const q = window._friscyStdinQueue;
      if (!q) throw new Error('stdin queue missing');
      const bytes = new TextEncoder().encode(payload);
      for (const b of bytes) q.push(b);
    }, text),
    new Promise((_, reject) => setTimeout(() => reject(new Error('sendInput timeout')), 10000)),
  ]);
}

async function readTerm(page) {
  return Promise.race([
    page.evaluate(() => {
      const t = window._friscyTerm;
      const b = t?.buffer?.active;
      if (!b) return '';
      const lines = [];
      for (let i = 0; i < b.length; i++) {
        const line = b.getLine(i);
        if (line) lines.push(line.translateToString(true));
      }
      return lines.slice(-300).join('\n');
    }),
    new Promise((resolve) => setTimeout(() => resolve(''), 10000)),
  ]);
}

async function exportCheckpoint(page, filename) {
  return page.evaluate(async (name) => {
    return window._friscyExportLiveCheckpointUpload(name);
  }, filename);
}

function statInfo(absPath) {
  try {
    const st = fs.statSync(absPath);
    return { exists: true, bytes: st.size, mtimeMs: st.mtimeMs };
  } catch {
    return { exists: false, bytes: 0, mtimeMs: 0 };
  }
}

function validateStep(step) {
  const cmd = String(step.command || '');
  const forbidden = [
    /--version\b/i,
    /\bcommand\s+-v\b/i,
    /\bwhich\b/i,
    /\btype\b/i,
    /\b--help\b/i,
    /\s-h\b/i,
  ];
  for (const re of forbidden) {
    if (re.test(cmd)) {
      throw new Error(`refusing non-live checkpoint command for ${step.name}: ${cmd}`);
    }
  }
  if (!step.mustContain || typeof step.mustContain !== 'string') {
    throw new Error(`missing mustContain token for ${step.name}`);
  }
}

async function runCheckpointStep(page, step) {
  validateStep(step);
  const marker = `__CKPT_${step.name.toUpperCase()}_${Date.now()}__`;
  const begin = `${marker}_BEGIN`;
  const end = `${marker}_END`;
  const cmd = `echo ${begin}; ${step.command}; echo ${end}\n`;
  const outPath = path.join(BUNDLE_DIR, step.checkpoint);
  const before = statInfo(outPath);

  const stdinReady = await waitStdin(page, 180000);
  if (!stdinReady) {
    throw new Error(`${step.name} stdin was not requested before command injection`);
  }
  const termBefore = await readTerm(page);
  await sendInput(page, cmd);

  await waitFor(
    async () => {
      const t = await readTerm(page);
      return t.includes(begin);
    },
    180000,
    `${step.name} begin marker`,
  );
  await waitFor(
    async () => {
      const t = await readTerm(page);
      return t.includes(end);
    },
    180000,
    `${step.name} end marker`,
  );

  const term = await readTerm(page);
  const searchFrom = Math.max(0, termBefore.length - 256);
  const beginIdx = term.indexOf(begin, searchFrom);
  const endIdx = beginIdx >= 0 ? term.indexOf(end, beginIdx + begin.length) : -1;
  if (beginIdx < 0 || endIdx <= beginIdx) {
    throw new Error(`${step.name} marker window missing\n--- before ---\n${termBefore.slice(-800)}\n--- after ---\n${term.slice(-2000)}`);
  }
  const windowText = term.slice(beginIdx + begin.length, endIdx);
  if (!windowText.includes(step.mustContain)) {
    throw new Error(`${step.name} missing live token "${step.mustContain}" between markers`);
  }
  if (/Error:|Command failed|missing|invalid api key|Please set an Auth method/i.test(windowText)) {
    throw new Error(`${step.name} reported runtime/auth failure: ${windowText.slice(0, 260)}`);
  }

  await sleep(step.settleMs || 6000);
  const uploaded = await exportCheckpoint(page, step.checkpoint);
  const after = statInfo(outPath);

  const minBytes = step.minBytes || (16 * 1024 * 1024);
  if (!after.exists || after.bytes < minBytes) {
    throw new Error(`${step.name} checkpoint invalid size: ${after.bytes}`);
  }

  return { uploaded, before, after };
}

async function main() {
  const steps = [
    { name: 'claude', example: 'claude-tui', command: 'claude -p "Reply with exactly: CLAUDE_LIVE_OK"', mustContain: 'CLAUDE_LIVE_OK', checkpoint: 'claude-version-post.ckpt', settleMs: 12000, minBytes: 16 * 1024 * 1024 },
    { name: 'codex', example: 'codex', command: 'codex e "Reply with exactly: CODEX_LIVE_OK"', mustContain: 'CODEX_LIVE_OK', checkpoint: 'codex-version-post.ckpt', settleMs: 12000, minBytes: 16 * 1024 * 1024 },
    { name: 'gemini', example: 'gemini-tui', command: 'gemini -p "Reply with exactly: GEMINI_LIVE_OK"', mustContain: 'GEMINI_LIVE_OK', checkpoint: 'gemini-version-post.ckpt', settleMs: 12000, minBytes: 1 * 1024 * 1024 },
  ];

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
  page.setDefaultTimeout(15000);
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[worker]') || text.includes('checkpoint') || text.includes('startup failed')) {
      console.log(`[console:${msg.type()}] ${text}`);
    }
  });

  try {
    const results = {};
    for (const step of steps) {
      console.log(`[matrix] boot ${step.example}`);
      await bootExample(page, step.example);
      console.log(`[matrix] run ${step.command}`);
      results[step.name] = await runCheckpointStep(page, step);
      console.log(`[matrix] checkpoint ${step.checkpoint} bytes=${results[step.name].after.bytes}`);
    }
    console.log('[matrix] done', JSON.stringify(results, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('[matrix] fatal:', err?.stack || err?.message || String(err));
  process.exit(1);
});
