#!/usr/bin/env node
import puppeteer from 'puppeteer';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');
const DOCS_DIR = join(PROJECT_ROOT, 'docs_site');

const PORT = Number.parseInt(process.env.FRISCY_DOCS_PORT || '9091', 10);
const TIMEOUT_MS = Number.parseInt(process.env.FRISCY_DOCS_TIMEOUT_MS || '90000', 10);

function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function startServer() {
  const server = spawn('node', ['serve.js', String(PORT)], { cwd: DOCS_DIR, stdio: ['ignore', 'pipe', 'pipe'] });
  let ready = false;
  server.stdout.on('data', (d) => {
    const t = d.toString();
    if (t.includes('Server running at')) ready = true;
  });
  for (let i = 0; i < 60; i++) {
    if (ready) return server;
    await delay(250);
  }
  throw new Error('docs_site server did not become ready');
}

async function runCase(browser, example, probeCmd, expectPattern) {
  const page = await browser.newPage();
  const logs = [];
  let pageErr = null;
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => { pageErr = err.message || String(err); });

  const url = `http://127.0.0.1:${PORT}/?example=${example}&nojit`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Let initial boot settle.
  await delay(12000);

  // Try terminal probe command when provided.
  if (probeCmd) {
    await page.click('#terminal');
    await page.keyboard.type(probeCmd);
    await page.keyboard.press('Enter');
  }

  const start = Date.now();
  let term = '';
  let status = '';
  while (Date.now() - start < TIMEOUT_MS) {
    try {
      const snap = await page.evaluate(() => {
        const termEl = document.querySelector('.xterm-rows');
        const statusEl = document.getElementById('status');
        const netEl = document.getElementById('net-status');
        return {
          term: termEl ? termEl.textContent || '' : '',
          status: statusEl ? statusEl.textContent || '' : '',
          net: netEl ? netEl.textContent || '' : '',
        };
      });
      term = snap.term;
      status = `${snap.status} | ${snap.net}`;
      if (expectPattern && expectPattern.test(term)) break;
      if (/Error:\s|VFS: Could not open|Run failed/i.test(term)) break;
    } catch {
      // ignore transient context churn
    }
    await delay(500);
  }

  const workerErrors = logs.filter((l) => /\[worker\] Error|Run failed|VFS: Could not open|fatal/i.test(l));
  const ok = expectPattern ? expectPattern.test(term) : workerErrors.length === 0;

  await page.close();
  return {
    ok,
    example,
    status,
    pageErr,
    workerErrors: workerErrors.slice(0, 5),
    termHead: term.slice(0, 500),
  };
}

async function main() {
  let server;
  let browser;
  try {
    server = await startServer();
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--js-flags=--max-old-space-size=4096'],
    });

    const results = [];
    results.push(await runCase(browser, 'alpine', 'echo OK_ALPINE', /OK_ALPINE/));
    results.push(await runCase(browser, 'nodejs', 'console.log("OK_NODE")', /OK_NODE/));
    // server demo expects network/proxy; treat startup banner as minimal pass
    results.push(await runCase(browser, 'server', null, /(http server started|listening on port|echo)/i));

    for (const r of results) {
      console.log(`\n[${r.ok ? 'PASS' : 'FAIL'}] example=${r.example}`);
      console.log(`status=${r.status}`);
      if (r.pageErr) console.log(`pageErr=${r.pageErr}`);
      if (r.workerErrors.length) console.log(`workerErrors=${r.workerErrors.join(' || ')}`);
      console.log(`termHead=${r.termHead.replace(/\s+/g, ' ').slice(0, 220)}`);
    }

    const passCount = results.filter((r) => r.ok).length;
    console.log(`\n[SUMMARY] pass=${passCount}/3`);
    process.exit(passCount === 3 ? 0 : 1);
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) server.kill('SIGTERM');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
