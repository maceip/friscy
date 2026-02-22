#!/usr/bin/env node
import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT = resolve(__dirname, '..');
const BUNDLE = resolve(PROJECT, 'friscy-bundle');
const BASE = 'http://localhost:9090';

async function ensureServer() {
  try {
    const r = await fetch(`${BASE}/manifest.json`);
    if (r.ok) return null;
  } catch {}
  const proc = spawn('node', ['serve.js', '9090'], {
    cwd: BUNDLE,
    stdio: 'ignore',
    detached: true,
  });
  proc.unref();
  await new Promise((r) => setTimeout(r, 2000));
  return proc;
}

async function main() {
  const server = await ensureServer();
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--enable-features=SharedArrayBuffer',
      '--enable-features=WebAssemblyExnRef',
    ],
  });

  try {
    const page = await browser.newPage();
    const logs = [];
    page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));

    await page.goto(`${BASE}/claude-demo.html?example=claude-demo`, {
      waitUntil: 'networkidle2',
      timeout: 120000,
    });

    await page.waitForFunction(() => window._friscy && window._friscy.phase === 'apikey', {
      timeout: 120000,
    });
    await page.evaluate(() => window.term?.paste('sk-ant-dummy\r'));

    await page.waitForFunction(() => {
      if (!window._friscy) return false;
      const p = window._friscy.phase;
      return p === 'prompt' || p === 'working' || p === 'streaming' || p === 'shell' || p === 'login_wait';
    }, {
      timeout: 180000,
    });

    const before = await page.evaluate(() => ({
      phase: window._friscy?.phase,
      rawLen: (window._friscy?.rawOutputBuf || '').length,
      termText: document.querySelector('.xterm-rows')?.textContent || '',
    }));

    await page.evaluate(() => {
      if (window._friscy?.sendStdin) {
        window._friscy.sendStdin('Write one short word.\n');
      } else {
        window.term?.paste('Write one short word.\r');
      }
    });
    await page.waitForFunction(() => window._friscy && (window._friscy.phase === 'working' || window._friscy.phase === 'streaming' || window._friscy.phase === 'prompt'), {
      timeout: 60000,
    });
    await page.waitForFunction(() => window._friscy && (window._friscy.phase === 'prompt' || window._friscy.phase === 'shell'), {
      timeout: 180000,
    });

    const after = await page.evaluate(() => ({
      phase: window._friscy?.phase,
      rawBuf: window._friscy?.rawOutputBuf || '',
      termText: document.querySelector('.xterm-rows')?.textContent || '',
    }));

    const rawDelta = after.rawBuf.slice(before.rawLen);
    const hasMarkers = rawDelta.includes('\x02START\x02') && rawDelta.includes('\x02END\x02');
    const termChanged = after.termText.length > before.termText.length;

    console.log(JSON.stringify({
      pass: hasMarkers && termChanged && after.phase === 'prompt',
      hasMarkers,
      termChanged,
      phaseAfter: after.phase,
      rawDeltaPreview: rawDelta.slice(0, 300),
      logTail: logs.slice(-20),
    }, null, 2));

    process.exit(hasMarkers && termChanged ? 0 : 1);
  } finally {
    await browser.close();
    if (server) {
      try { process.kill(-server.pid, 'SIGTERM'); } catch {}
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
