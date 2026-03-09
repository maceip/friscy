#!/usr/bin/env node
import puppeteer from 'puppeteer';

const PORT = Number(process.env.FRISCY_PORT || 9010);
const BASE = `http://127.0.0.1:${PORT}`;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(fn, timeoutMs, label, intervalMs = 250) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return;
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
    () => page.evaluate(() => Boolean(window._friscyStdinQueue && window._friscyAwaitStdinRequest && window._friscyExportLiveCheckpointUpload)),
    300000,
    `webshell hooks (${example})`,
  );
}

async function waitStdin(page, timeoutMs = 180000) {
  return page.evaluate(async (t) => {
    if (typeof window._friscyAwaitStdinRequest !== 'function') return false;
    return window._friscyAwaitStdinRequest(t);
  }, timeoutMs);
}

async function sendInput(page, text) {
  await page.evaluate((payload) => {
    const q = window._friscyStdinQueue;
    if (!q) throw new Error('stdin queue missing');
    const bytes = new TextEncoder().encode(payload);
    for (const b of bytes) q.push(b);
  }, text);
}

async function readTerm(page) {
  return page.evaluate(() => {
    const t = window._friscyTerm;
    const b = t?.buffer?.active;
    if (!b) return '';
    const lines = [];
    for (let i = 0; i < b.length; i++) {
      const line = b.getLine(i);
      if (line) lines.push(line.translateToString(true));
    }
    return lines.slice(-500).join('\n');
  });
}

function hasBadError(text) {
  return /Error:|Command failed|invalid api key|Incorrect API key|Please set an Auth method|missing/i.test(text);
}

async function runStep(page, step) {
  const begin = `__LIVE_${step.name.toUpperCase()}_${Date.now()}_BEGIN__`;
  const end = `__LIVE_${step.name.toUpperCase()}_${Date.now()}_END__`;
  const rc = `__LIVE_${step.name.toUpperCase()}_RC__`;
  const cmd = [
    `echo ${begin}`,
    `${step.keyName}='${step.keyValue}' ${step.command}`,
    `code=$?; echo ${rc}:$code`,
    `echo ${end}`,
  ].join('; ') + '\n';

  await waitStdin(page, 180000);
  await sendInput(page, cmd);

  await waitFor(
    async () => {
      const t = await readTerm(page);
      return t.includes(begin) && t.includes(end) && t.includes(`${rc}:`);
    },
    420000,
    `${step.name} command completion`,
  );

  const term = await readTerm(page);
  const i1 = term.lastIndexOf(begin);
  const i2 = term.lastIndexOf(end);
  if (i1 < 0 || i2 <= i1) throw new Error(`${step.name}: marker window missing`);
  const windowText = term.slice(i1 + begin.length, i2);
  const m = windowText.match(new RegExp(`${rc}:(\\d+)`));
  const exitCode = m ? Number(m[1]) : NaN;
  if (!Number.isFinite(exitCode) || exitCode !== 0) {
    throw new Error(`${step.name}: command exit code != 0`);
  }
  if (hasBadError(windowText)) {
    throw new Error(`${step.name}: detected runtime/auth error`);
  }
  // Ensure there is meaningful output beyond command echo/markers.
  const stripped = windowText
    .replace(new RegExp(`${step.keyName}='[^']+'\\s+${step.command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), '')
    .replace(new RegExp(`${rc}:\\d+`), '')
    .replace(/\s+/g, ' ')
    .trim();
  if (stripped.length < 12) {
    throw new Error(`${step.name}: insufficient model output`);
  }

  await sleep(8000);
  const uploaded = await page.evaluate(async (filename) => {
    return window._friscyExportLiveCheckpointUpload(filename);
  }, step.checkpoint);

  return { exitCode, uploaded };
}

async function main() {
  const steps = [
    {
      name: 'claude',
      example: 'claude-tui',
      command: "claude -p 'write me a haiku'",
      keyName: 'ANTHROPIC_API_KEY',
      keyValue: ANTHROPIC_API_KEY,
      checkpoint: 'claude-haiku-live.ckpt',
    },
    {
      name: 'codex',
      example: 'codex',
      command: "codex e 'write me a haiku'",
      keyName: 'OPENAI_API_KEY',
      keyValue: OPENAI_API_KEY,
      checkpoint: 'codex-haiku-live.ckpt',
    },
    {
      name: 'gemini',
      example: 'gemini-tui',
      command: "gemini -p 'write me a haiku'",
      keyName: 'GEMINI_API_KEY',
      keyValue: GEMINI_API_KEY,
      checkpoint: 'gemini-haiku-live.ckpt',
    },
  ];

  for (const s of steps) {
    if (!s.keyValue) throw new Error(`missing ${s.keyName} in environment`);
  }

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
    if (text.includes('[worker]') || text.includes('startup failed') || text.includes('checkpoint')) {
      console.log(`[console:${msg.type()}] ${text}`);
    }
  });

  try {
    const result = {};
    for (const step of steps) {
      console.log(`[live] boot ${step.example}`);
      await bootExample(page, step.example);
      console.log(`[live] run ${step.name}: ${step.command}`);
      result[step.name] = await runStep(page, step);
      console.log(`[live] exported ${step.checkpoint}`, result[step.name].uploaded);
    }
    console.log('[live] done', JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('[live] fatal:', err?.stack || err?.message || String(err));
  process.exit(1);
});

