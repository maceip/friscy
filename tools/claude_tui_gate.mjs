#!/usr/bin/env node
// claude_tui_gate.mjs — Headless TUI gate for Claude (no-arg)
//
// Usage:
//   node tools/claude_tui_gate.mjs [--port 9090] [--report path]
//
// Prerequisites: server running (node friscy-bundle/serve.js 9090)

import puppeteer from 'puppeteer';
import { resolve, dirname } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT = resolve(__dirname, '..');

let port = 9090;
let reportPath = resolve(PROJECT, 'build', 'test-reports', 'claude-tui-gate.json');
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) {
    port = parseInt(args[++i], 10);
  } else if (args[i] === '--report' && args[i + 1]) {
    reportPath = resolve(args[++i]);
  }
}

const BASE = `http://localhost:${port}`;
const TUI_URL = `${BASE}/claude-demo.html?example=claude-tui`;

const TUI_MARKERS = [
  /accessing workspace/i,
  /quick safety check/i,
  /security guide/i,
  /claude code/i,
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const t0 = Date.now();
  try {
    const r = await fetch(`${BASE}/manifest.json`);
    if (!r.ok) throw new Error('Server not responding');
  } catch (e) {
    console.error('[tui-gate] Server not running. Start with:');
    console.error(`  cd friscy-bundle && node serve.js ${port}`);
    process.exit(1);
  }

  const browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: 60 * 60 * 1000,
    executablePath: '/usr/bin/google-chrome',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--enable-features=SharedArrayBuffer',
      '--enable-features=WebAssemblyExnRef',
    ],
  });

  const page = await browser.newPage();
  const pageLogs = [];
  page.on('console', (msg) => pageLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => pageLogs.push(`[pageerror] ${err.message}`));

  const report = {
    ok: false,
    criteria: {
      sawTuiDraw: false,
      arrowKeysChange: false,
      enterKeyChange: false,
      relaunchInteractive: false,
    },
    timings: {},
    errors: [],
    logTail: [],
    timestamp: new Date().toISOString(),
  };

  try {
    await page.goto(TUI_URL, { waitUntil: 'networkidle2', timeout: 120000 });
    await page.waitForFunction(() => window._friscyStdinQueue && document.querySelector('.xterm-rows'), { timeout: 120000 });

    const readScreen = async () =>
      page.evaluate(() => document.querySelector('.xterm-rows')?.textContent || '');

    const sendInput = async (text) => {
      await page.evaluate((payload) => {
        const q = window._friscyStdinQueue;
        if (!q) return;
        const enc = new TextEncoder();
        const bytes = enc.encode(payload);
        for (let i = 0; i < bytes.length; i++) q.push(bytes[i]);
      }, text);
    };

    // Launch claude with no args
    await sendInput('claude\r');

    const tuiStart = Date.now();
    let screen = await readScreen();
    while (!TUI_MARKERS.some((re) => re.test(screen))) {
      if (Date.now() - tuiStart > 60000) throw new Error('Timed out waiting for Claude TUI draw');
      await sleep(500);
      screen = await readScreen();
    }
    report.criteria.sawTuiDraw = true;
    report.timings.tuiFirstDrawMs = Date.now() - tuiStart;

    // Arrow key gate — ensure visible change
    const beforeArrow = screen;
    await sendInput('\x1b[B'); // ArrowDown
    await sleep(600);
    const afterDown = await readScreen();
    await sendInput('\x1b[A'); // ArrowUp
    await sleep(600);
    const afterUp = await readScreen();
    report.criteria.arrowKeysChange = beforeArrow !== afterDown || afterDown !== afterUp;

    // Enter key gate — should change UI state
    const beforeEnter = await readScreen();
    await sendInput('\r');
    await sleep(900);
    const afterEnter = await readScreen();
    report.criteria.enterKeyChange = beforeEnter !== afterEnter;

    // Exit claude (Ctrl+C twice) and relaunch
    await sendInput('\x03');
    await sleep(200);
    await sendInput('\x03');
    await sleep(1200);
    await sendInput('claude\r');

    const relaunchStart = Date.now();
    let relaunchScreen = await readScreen();
    while (!TUI_MARKERS.some((re) => re.test(relaunchScreen))) {
      if (Date.now() - relaunchStart > 60000) break;
      await sleep(500);
      relaunchScreen = await readScreen();
    }
    report.criteria.relaunchInteractive = TUI_MARKERS.some((re) => re.test(relaunchScreen));
    report.timings.relaunchMs = Date.now() - relaunchStart;

    report.ok = Object.values(report.criteria).every(Boolean);
  } catch (e) {
    report.errors.push(e?.message || String(e));
  } finally {
    report.logTail = pageLogs.slice(-120);
    try { mkdirSync(resolve(PROJECT, 'build', 'test-reports'), { recursive: true }); } catch {}
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    await browser.close();
  }

  if (!report.ok) {
    console.error('[tui-gate] FAILED. Report:', reportPath);
    process.exit(1);
  }
  console.log('[tui-gate] OK. Report:', reportPath);
}

main().catch((e) => {
  console.error('[tui-gate] Fatal:', e?.message || String(e));
  process.exit(1);
});
