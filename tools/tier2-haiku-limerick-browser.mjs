#!/usr/bin/env node
import puppeteer from 'puppeteer';
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

let port = 9998;
let reportPath = resolve('build', 'test-reports', 'tier2-haiku-limerick-report.json');
let checkpointName = 'claude_haiku.chkpt';
let apiKey = process.env.ANTHROPIC_API_KEY || '';
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) port = Number(args[++i]);
  else if (args[i] === '--report' && args[i + 1]) reportPath = resolve(args[++i]);
  else if (args[i] === '--checkpoint' && args[i + 1]) checkpointName = args[++i];
  else if (args[i] === '--api-key' && args[i + 1]) apiKey = args[++i];
}

if (!apiKey) {
  console.error('Missing API key. Provide --api-key or ANTHROPIC_API_KEY env var.');
  process.exit(1);
}

const BASE = `http://localhost:${port}`;
const DOWNLOAD_DIR = resolve('build', 'export-dl');
const CHECKPOINT_PATH = resolve('friscy-bundle', checkpointName);

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function waitForPrompt(page, timeoutMs = 600000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const phase = await page.evaluate(() => window._friscy?.phase || 'none');
    if (phase === 'prompt') return true;
    await sleep(250);
  }
  return false;
}

async function waitForWorkingThenPrompt(page, timeoutMs = 900000) {
  const start = Date.now();
  let sawWorking = false;
  while (Date.now() - start < timeoutMs) {
    const phase = await page.evaluate(() => window._friscy?.phase || 'none');
    if (phase === 'working' || phase === 'streaming') sawWorking = true;
    if (sawWorking && phase === 'prompt') return true;
    await sleep(250);
  }
  return false;
}

function latestDownloadedFile() {
  const files = readdirSync(DOWNLOAD_DIR)
    .filter((f) => f.endsWith('.ckpt') && !f.endsWith('.crdownload'))
    .map((f) => ({ f, mtime: statSync(resolve(DOWNLOAD_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return files[0]?.f || null;
}

async function main() {
  console.log('[tier2] starting run');
  mkdirSync(resolve('build', 'test-reports'), { recursive: true });
  mkdirSync(DOWNLOAD_DIR, { recursive: true });
  try { rmSync(resolve(DOWNLOAD_DIR, checkpointName), { force: true }); } catch {}
  try { rmSync(CHECKPOINT_PATH, { force: true }); } catch {}

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
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOAD_DIR });

  const result = {
    ok: false,
    checkpointPath: CHECKPOINT_PATH,
    phase1: { command: 'claude -p "write me a haiku"', checkpointSaved: false },
    phase2: { command: 'claude -p "write me a Limerick"', bootMs: null, limerickMs: null, completed: false },
    notes: { tier2Requested: true, ckptParamUsed: true },
    logTail: [],
  };

  try {
    // Phase 1: boot + haiku + save checkpoint.
    console.log('[tier2] phase1: navigate');
    await page.goto(`${BASE}/claude-demo.html?example=claude-demo&tier2strict=1`, {
      waitUntil: 'networkidle2',
      timeout: 180000,
    });
    console.log('[tier2] phase1: waiting for apikey/prompt');
    await page.waitForFunction(
      () => window._friscy && (window._friscy.phase === 'apikey' || window._friscy.phase === 'prompt'),
      { timeout: 300000 }
    );
    const phase = await page.evaluate(() => window._friscy?.phase);
    if (phase === 'apikey') {
      console.log('[tier2] phase1: submitting api key');
      await page.evaluate((k) => window.term?.paste(k + '\r'), apiKey);
      const ready = await waitForPrompt(page, 600000);
      if (!ready) throw new Error('Phase1 prompt not reached');
    }

    console.log('[tier2] phase1: running haiku command');
    await page.evaluate(() => window._friscy?.sendStdin('claude -p "write me a haiku"\n'));
    const haikuDone = await waitForWorkingThenPrompt(page, 1200000);
    if (!haikuDone) throw new Error('Haiku command did not complete');

    console.log('[tier2] phase1: exporting live checkpoint');
    await page.evaluate((name) => window._friscy?.exportLiveCheckpointDownload(name), checkpointName);
    const dlStart = Date.now();
    let downloaded = null;
    while (Date.now() - dlStart < 180000) {
      const f = latestDownloadedFile();
      if (f && f === checkpointName) { downloaded = f; break; }
      await sleep(500);
    }
    if (!downloaded) throw new Error('Checkpoint download not found');
    copyFileSync(resolve(DOWNLOAD_DIR, downloaded), CHECKPOINT_PATH);
    result.phase1.checkpointSaved = existsSync(CHECKPOINT_PATH);
    if (!result.phase1.checkpointSaved) throw new Error('Failed to copy checkpoint to bundle');
    console.log('[tier2] phase1: checkpoint saved');

    // Phase 2: load checkpoint, measure boot, run limerick, measure command time.
    console.log('[tier2] phase2: navigate with checkpoint');
    const bootStart = Date.now();
    await page.goto(
      `${BASE}/claude-demo.html?example=claude-demo&tier2strict=1&ckpt=${encodeURIComponent('./' + checkpointName)}`,
      { waitUntil: 'networkidle2', timeout: 180000 }
    );
    await page.waitForFunction(
      () => window._friscy && (window._friscy.phase === 'apikey' || window._friscy.phase === 'prompt'),
      { timeout: 300000 }
    );
    let phase2 = await page.evaluate(() => window._friscy?.phase);
    if (phase2 === 'apikey') {
      console.log('[tier2] phase2: submitting api key');
      await page.evaluate((k) => window.term?.paste(k + '\r'), apiKey);
    }
    const bootReady = await waitForPrompt(page, 600000);
    if (!bootReady) throw new Error('Phase2 prompt not reached');
    result.phase2.bootMs = Date.now() - bootStart;
    console.log(`[tier2] phase2: prompt reached in ${result.phase2.bootMs}ms`);

    const limStart = Date.now();
    console.log('[tier2] phase2: running limerick command');
    await page.evaluate(() => window._friscy?.sendStdin('claude -p "write me a Limerick"\n'));
    const limDone = await waitForWorkingThenPrompt(page, 1200000);
    if (!limDone) throw new Error('Limerick command did not complete');
    result.phase2.limerickMs = Date.now() - limStart;
    result.phase2.completed = true;
    console.log(`[tier2] phase2: limerick completed in ${result.phase2.limerickMs}ms`);
    result.ok = true;
  } catch (e) {
    result.error = e?.message || String(e);
  } finally {
    result.logTail = logs.slice(-120);
    writeFileSync(reportPath, JSON.stringify(result, null, 2));
    await browser.close();
  }

  console.log(JSON.stringify({
    ok: result.ok,
    checkpointSaved: result.phase1.checkpointSaved,
    bootMs: result.phase2.bootMs,
    limerickMs: result.phase2.limerickMs,
    report: reportPath,
    checkpoint: CHECKPOINT_PATH,
    error: result.error || null,
  }, null, 2));

  if (!result.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

