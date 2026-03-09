#!/usr/bin/env node
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.FRISCY_PORT || 9010);
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = path.join(process.cwd(), 'friscy-bundle', 'claude-mcp-list-post.ckpt');

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function waitFor(fn, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return;
    await sleep(250);
  }
  throw new Error(`timeout waiting for ${label}`);
}

async function sendInput(page, text) {
  await page.evaluate((payload) => {
    const q = window._friscyStdinQueue;
    if (!q) throw new Error('stdin queue missing');
    const bytes = new TextEncoder().encode(payload);
    for (const b of bytes) q.push(b);
  }, text);
}

async function waitStdin(page, timeoutMs = 120000) {
  return await page.evaluate(async (t) => {
    if (typeof window._friscyAwaitStdinRequest !== 'function') return false;
    return await window._friscyAwaitStdinRequest(t);
  }, timeoutMs);
}

(async () => {
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
  page.setDefaultTimeout(20 * 60 * 1000);

  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[worker]') || text.includes('checkpoint') || text.includes('resume telemetry')) {
      console.log(`[console:${msg.type()}] ${text}`);
    }
  });

  try {
    await page.goto(`${BASE}/?example=claude-resume`, { waitUntil: 'networkidle2', timeout: 300000 });
    await waitFor(
      () => page.evaluate(() => Boolean(window._friscyStdinQueue && window._friscyExportLiveCheckpointUpload && window._friscyAwaitStdinRequest)),
      300000,
      'webshell hooks'
    );

    await waitStdin(page, 180000);
    console.log('[mcp] running: exec claude mcp list');
    await sendInput(page, 'exec claude mcp list\n');

    await sleep(30000);

    const up = await page.evaluate(async () => {
      return await window._friscyExportLiveCheckpointUpload('claude-mcp-list-post.ckpt');
    });
    console.log('[mcp] checkpoint upload:', up);
  } finally {
    await browser.close();
  }

  if (!fs.existsSync(OUT)) {
    throw new Error('expected checkpoint file missing: ' + OUT);
  }
  const st = fs.statSync(OUT);
  console.log('[mcp] checkpoint file:', OUT, st.size);
})();
