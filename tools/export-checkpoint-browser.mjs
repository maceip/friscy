#!/usr/bin/env node
// export-checkpoint-browser.mjs — Export checkpoint via browser (with LD_PRELOAD)
//
// Uses Puppeteer + Chrome to run friscy Wasm with JSPI, which supports vh_preload
// (compute offload). Native friscy cannot use LD_PRELOAD.
//
// Usage: node tools/export-checkpoint-browser.mjs [--out path] [--port N]
//   --out   Output path (default: friscy-bundle/claude-repl.ckpt)
//   --port  Server port (default: 9090)
//
// Prerequisites: Server running (node friscy-bundle/serve.js 9090)
// Takes ~20–30 minutes.

import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT = resolve(__dirname, '..');
const BUNDLE = resolve(PROJECT, 'friscy-bundle');

let outPath = resolve(BUNDLE, 'claude-repl.ckpt');
let port = 9090;
let reportPath = resolve(PROJECT, 'build', 'test-reports', 'browser-export-report.json');
let verifyMcpList = true;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out' && args[i + 1]) {
    outPath = resolve(args[++i]);
  } else if (args[i] === '--port' && args[i + 1]) {
    port = parseInt(args[++i], 10);
  } else if (args[i] === '--report' && args[i + 1]) {
    reportPath = resolve(args[++i]);
  } else if (args[i] === '--no-verify-mcp-list') {
    verifyMcpList = false;
  }
}

const BASE = `http://localhost:${port}`;

async function main() {
  const t0 = Date.now();
  // Ensure server is reachable
  try {
    const r = await fetch(`${BASE}/manifest.json`);
    if (!r.ok) throw new Error('Server not responding');
  } catch (e) {
    console.error('[export] Server not running. Start with:');
    console.error(`  cd friscy-bundle && node serve.js ${port}`);
    process.exit(1);
  }

  console.log('[export] Launching Chrome...');
  const browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: 60 * 60 * 1000,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--enable-features=SharedArrayBuffer',
      '--enable-features=WebAssemblyExnRef',
    ],
  });

  const page = await browser.newPage();
  const pageLogs = [];
  page.on('console', (msg) => {
    pageLogs.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    pageLogs.push(`[pageerror] ${err.message}`);
  });

  // Enable downloads and set path
  const downloadDir = resolve(PROJECT, 'build', 'export-dl');
  try { mkdirSync(downloadDir, { recursive: true }); } catch {}
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadDir,
  });


  console.log('[export] Navigating to export page...');
  await page.goto(`${BASE}/export-checkpoint.html`, {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });

  console.log('[export] Export running (~20–30 min). Waiting for completion...');
  await page.waitForFunction(
    () => window.__checkpointExportDone || window.__checkpointExportError,
    { timeout: 45 * 60 * 1000 }
  );

  const err = await page.evaluate(() => window.__checkpointExportError);
  const stack = await page.evaluate(() => window.__checkpointExportStack);
  const timeline = await page.evaluate(() => window.__checkpointExportTimeline || []);
  const workerMetrics = await page.evaluate(() => window.__checkpointExportMetrics || null);
  const sawBootStarted = timeline.some((e) => e.stage === 'boot-started');
  const sawStdinWait = timeline.some((e) => e.stage === 'stdin-wait-reached');

  try { mkdirSync(resolve(PROJECT, 'build', 'test-reports'), { recursive: true }); } catch {}
  if (err) {
    const report = {
      ok: false,
      failedAt: 'export-runtime',
      criteria: {
        bootFromRootfsWithLdPreload: sawBootStarted,
        reachedStdinWait: sawStdinWait,
        exportedCheckpoint: false,
        commandRoundTripMcpList: false,
      },
      timeline,
      workerMetrics,
      error: err,
      stack,
      logTail: pageLogs.slice(-120),
      elapsedMs: Date.now() - t0,
      timestamp: new Date().toISOString(),
    };
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.error('[export] Export failed:', err);
    if (stack) console.error('[export] Stack:', stack);
    const tail = pageLogs.slice(-20);
    if (tail.length) {
      console.error('[export] Console tail:');
      for (const line of tail) console.error('  ' + line);
    }
    console.error(`[export] Report written: ${reportPath}`);
    await browser.close();
    process.exit(1);
  }

  // Checkpoint arrives via worker postMessage → page triggers download
  const files = readdirSync(downloadDir);
  const ckptFile = files.find((f) => f.endsWith('.ckpt') || f === 'claude-repl.ckpt');
  if (!ckptFile) {
    console.error('[export] Download not found. Check that the page completed and triggered download.');
    await browser.close();
    process.exit(1);
  }
  const data = readFileSync(resolve(downloadDir, ckptFile));
  writeFileSync(outPath, data);
  console.log(`[export] Written ${(data.length / 1048576).toFixed(1)} MB to ${outPath}`);

  let commandResult = {
    attempted: false,
    ok: false,
    elapsedMs: null,
    preview: '',
    error: null,
  };
  if (verifyMcpList) {
    commandResult.attempted = true;
    const tCmd = Date.now();
    try {
      console.log('[export] Verifying command round-trip: claude mcp list');
      await page.goto(`${BASE}/claude-demo.html?example=claude-demo`, {
        waitUntil: 'networkidle2',
        timeout: 120000,
      });

      await page.waitForFunction(
        () => window._friscy && (window._friscy.phase === 'apikey' || window._friscy.phase === 'prompt'),
        { timeout: 120000 }
      );
      const phase = await page.evaluate(() => window._friscy?.phase);
      if (phase === 'apikey') {
        await page.evaluate(() => window.term?.paste('sk-ant-dummy\r'));
        await page.waitForFunction(() => window._friscy && window._friscy.phase === 'prompt', { timeout: 180000 });
      }

      const before = await page.evaluate(() => document.querySelector('.xterm-rows')?.textContent || '');
      await page.evaluate(() => window.term?.paste('claude mcp list\r'));
      await page.waitForFunction(() => window._friscy && window._friscy.phase === 'working', { timeout: 30000 });
      await page.waitForFunction(() => window._friscy && window._friscy.phase === 'prompt', { timeout: 180000 });

      const after = await page.evaluate(() => document.querySelector('.xterm-rows')?.textContent || '');
      const delta = after.length >= before.length ? after.slice(before.length) : after;
      const normalized = delta.replace(/\s+/g, ' ').trim();
      const withoutCmd = normalized.replace(/claude mcp list/i, '').trim();
      commandResult.ok = withoutCmd.length >= 24;
      commandResult.elapsedMs = Date.now() - tCmd;
      commandResult.preview = withoutCmd.slice(0, 300);
    } catch (e) {
      commandResult.elapsedMs = Date.now() - tCmd;
      commandResult.error = e?.message || String(e);
    }
  }

  const commandGate = commandResult.attempted ? commandResult.ok : true;
  const report = {
    ok: sawBootStarted && sawStdinWait && commandGate,
    criteria: {
      bootFromRootfsWithLdPreload: sawBootStarted,
      reachedStdinWait: sawStdinWait,
      exportedCheckpoint: true,
      commandRoundTripMcpList: commandResult.attempted ? commandResult.ok : null,
    },
    timeline,
    workerMetrics: workerMetrics || {
      totalMs: Date.now() - t0,
      bytes: data.length,
    },
    output: {
      path: outPath,
      bytes: data.length,
      mib: Number((data.length / 1048576).toFixed(2)),
    },
    commandResult,
    logTail: pageLogs.slice(-120),
    elapsedMs: Date.now() - t0,
    timestamp: new Date().toISOString(),
  };
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`[export] Report written: ${reportPath}`);

  await browser.close();
}

main().catch((e) => {
  console.error('[export] Error:', e);
  process.exit(1);
});
