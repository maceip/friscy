#!/usr/bin/env node
import puppeteer from 'puppeteer';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');
const DOCS_DIR = join(PROJECT_ROOT, 'docs_site');

const PORT = Number.parseInt(process.env.FRISCY_DOCS_PORT || '9096', 10);
const TIMEOUT_MS = Number.parseInt(process.env.FRISCY_PTY_TIMEOUT_MS || '180000', 10);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(800);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, '127.0.0.1');
  });
}

async function ensureServer() {
  if (await isPortOpen(PORT)) return null;
  const server = spawn('node', ['serve.js', String(PORT)], {
    cwd: DOCS_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let ready = false;
  server.stdout.on('data', (d) => {
    if (String(d).includes('Server running at')) ready = true;
  });
  for (let i = 0; i < 80; i++) {
    if (ready) return server;
    await delay(250);
  }
  throw new Error('docs_site server did not become ready');
}

async function getTermText(page) {
  return page.evaluate(() => document.querySelector('.xterm-rows')?.textContent || '');
}

function countToken(text, token) {
  const re = new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  return (text.match(re) || []).length;
}

async function waitForPrompt(page, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const txt = await getTermText(page);
    if (txt.includes('/ #')) return txt;
    await delay(200);
  }
  throw new Error('timeout waiting for alpine shell prompt');
}

async function runCommandWithToken(page, cmd, token, timeoutMs = 30000) {
  const before = await getTermText(page);
  const beforeCount = countToken(before, token);

  await page.click('#terminal');
  await page.keyboard.type(`${cmd}; echo ${token}`);
  await page.keyboard.press('Enter');

  const t0 = Date.now();
  let txt = before;
  while (Date.now() - t0 < timeoutMs) {
    txt = await getTermText(page);
    const c = countToken(txt, token);
    if (c >= beforeCount + 1) {
      return { ok: true, before, after: txt, delta: txt.slice(before.length) };
    }
    await delay(200);
  }

  return { ok: false, before, after: txt, delta: txt.slice(before.length) };
}

function parseLastSttySize(text, token) {
  const idx = text.lastIndexOf(token);
  if (idx === -1) return null;
  const beforeToken = text.slice(0, idx);
  const m = beforeToken.match(/(\d+)\s+(\d+)\s*$/);
  if (!m) return null;
  return { rows: Number.parseInt(m[1], 10), cols: Number.parseInt(m[2], 10) };
}

async function main() {
  let server = null;
  let browser = null;
  try {
    server = await ensureServer();
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 760 });
    await page.goto(`http://127.0.0.1:${PORT}/?example=alpine`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    await waitForPrompt(page, TIMEOUT_MS);

    const alive = await runCommandWithToken(page, 'echo PTY_ALIVE', 'TOK_ALIVE');
    if (!alive.ok) throw new Error(`alive command did not complete: ${alive.delta.slice(-300)}`);

    const sttyA = await runCommandWithToken(page, 'stty size', 'TOK_STTY_A');
    if (!sttyA.ok) throw new Error(`stty size A failed: ${sttyA.delta.slice(-300)}`);
    const sizeA = parseLastSttySize(sttyA.after, 'TOK_STTY_A');
    if (!sizeA) throw new Error(`could not parse stty size A: ${sttyA.delta.slice(-300)}`);

    await page.setViewport({ width: 1600, height: 980 });
    await delay(900);

    const sttyB = await runCommandWithToken(page, 'stty size', 'TOK_STTY_B');
    if (!sttyB.ok) throw new Error(`stty size B failed: ${sttyB.delta.slice(-300)}`);
    const sizeB = parseLastSttySize(sttyB.after, 'TOK_STTY_B');
    if (!sizeB) throw new Error(`could not parse stty size B: ${sttyB.delta.slice(-300)}`);

    if (sizeA.rows === sizeB.rows && sizeA.cols === sizeB.cols) {
      throw new Error(`terminal size unchanged after resize (${sizeA.rows}x${sizeA.cols})`);
    }

    const tputCols = await runCommandWithToken(page, 'TERM=xterm-256color tput cols', 'TOK_TPUT_COLS');
    if (!tputCols.ok) throw new Error(`tput cols failed: ${tputCols.delta.slice(-300)}`);

    const tputLines = await runCommandWithToken(page, 'TERM=xterm-256color tput lines', 'TOK_TPUT_LINES');
    if (!tputLines.ok) throw new Error(`tput lines failed: ${tputLines.delta.slice(-300)}`);

    const infocmp = await runCommandWithToken(page, 'TERM=xterm-256color infocmp xterm-256color', 'TOK_INFOCMP');
    if (!infocmp.ok) throw new Error(`infocmp failed: ${infocmp.delta.slice(-300)}`);

    const vimVer = await runCommandWithToken(page, 'vim --version', 'TOK_VIMVER');
    if (!vimVer.ok) throw new Error(`vim --version failed: ${vimVer.delta.slice(-300)}`);

    console.log('[PASS] pty/ncurses smoke');
    console.log(`[PASS] stty size before resize: ${sizeA.rows}x${sizeA.cols}`);
    console.log(`[PASS] stty size after resize:  ${sizeB.rows}x${sizeB.cols}`);
    console.log('[PASS] tput + infocmp + vim --version');

    await page.close();
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) {
      server.kill('SIGTERM');
      await once(server, 'exit').catch(() => {});
    }
  }
}

main().catch((err) => {
  console.error('[FAIL] pty/ncurses smoke');
  console.error(err?.stack || String(err));
  process.exit(1);
});
