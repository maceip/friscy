#!/usr/bin/env node
import puppeteer from 'puppeteer';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const PORT = Number.parseInt(process.env.GOLDEN_DEMO_PORT || '9095', 10);
const BASE = `http://127.0.0.1:${PORT}`;

const BOOT_TIMEOUT_MS = Number.parseInt(process.env.GOLDEN_BOOT_TIMEOUT_MS || '180000', 10);
const CMD_TIMEOUT_MS = Number.parseInt(process.env.GOLDEN_CMD_TIMEOUT_MS || '180000', 10);
const PERF_BASELINE_PATH = process.env.GOLDEN_PERF_BASELINE || join(ROOT, 'tests/.perf/golden_demo_perf_baseline.json');
const UPDATE_BASELINE = process.env.GOLDEN_UPDATE_BASELINE === '1';
const PERF_TOLERANCE = Number.parseFloat(process.env.GOLDEN_PERF_TOLERANCE || '0');

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function startServer() {
  const p = spawn('node', ['golden_demo/serve.js', String(PORT)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let ready = false;
  p.stdout.on('data', (d) => {
    const t = d.toString();
    process.stdout.write(`[server] ${t}`);
    if (t.includes('golden_demo server:')) ready = true;
  });
  p.stderr.on('data', (d) => process.stdout.write(`[server-err] ${d}`));

  for (let i = 0; i < 80; i++) {
    if (ready) return p;
    await sleep(250);
  }
  throw new Error('golden_demo server did not become ready');
}

async function waitForRunning(page, example) {
  const start = Date.now();
  let lastLog = 0;
  while (Date.now() - start < BOOT_TIMEOUT_MS) {
    const snap = await page.evaluate(() => ({
      status: document.getElementById('status')?.textContent || '',
      boot: document.getElementById('boot')?.textContent || '',
      term: document.getElementById('term')?.textContent || '',
    }));

    const elapsed = Date.now() - start;
    if (elapsed - lastLog > 5000) {
      lastLog = elapsed;
      console.log(`[progress][${example}] boot ${Math.round(elapsed / 1000)}s status="${snap.status}" boot="${snap.boot}"`);
    }

    if (snap.status.includes(`running:${example}`)) {
      return { snap, elapsedMs: Date.now() - start };
    }
    if (snap.status === 'error' || /boot error/i.test(snap.term)) {
      throw new Error(`boot error for ${example}: ${snap.boot}`);
    }

    await sleep(400);
  }
  throw new Error(`boot timeout for ${example} after ${BOOT_TIMEOUT_MS}ms`);
}

async function sendCommand(page, example, cmd, expectRe, label) {
  console.log(`[progress][${example}] ${label} send: ${cmd}`);
  const before = await page.evaluate(() => document.getElementById('term')?.textContent || '');

  await page.evaluate((text) => {
    const input = document.getElementById('cmd');
    const send = document.getElementById('send');
    input.value = text;
    send.click();
  }, cmd);

  const start = Date.now();
  let lastLog = 0;
  while (Date.now() - start < CMD_TIMEOUT_MS) {
    const snap = await page.evaluate(() => ({
      status: document.getElementById('status')?.textContent || '',
      term: document.getElementById('term')?.textContent || '',
    }));
    const term = snap.term;
    const delta = term.length >= before.length ? term.slice(before.length) : term;
    if (expectRe.test(delta)) {
      const elapsedMs = Date.now() - start;
      console.log(`[progress][${example}] ${label} matched in ${Math.round(elapsedMs / 1000)}s`);
      return { delta, elapsedMs };
    }
    if (/^exit:/.test(snap.status) || snap.status === 'error') {
      throw new Error(`${label} aborted for ${example}: status=${snap.status}`);
    }

    const elapsed = Date.now() - start;
    if (elapsed - lastLog > 5000) {
      lastLog = elapsed;
      console.log(`[progress][${example}] ${label} waiting ${Math.round(elapsed / 1000)}s`);
    }

    await sleep(500);
  }
  throw new Error(`${label} timeout for ${example} after ${CMD_TIMEOUT_MS}ms`);
}

async function runExample(browser, example, checks) {
  const page = await browser.newPage();
  const logs = [];
  const pageErrors = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => pageErrors.push(e.message || String(e)));

  const url = `${BASE}/?example=${encodeURIComponent(example)}&t=${Date.now()}`;
  console.log(`[progress][${example}] goto ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const result = {
    example,
    ok: false,
    error: null,
    checks: [],
    pageErrors,
    logsTail: [],
    termTail: '',
    metrics: {
      bootMs: null,
      commandMs: {},
    },
  };

  try {
    const boot = await waitForRunning(page, example);
    result.metrics.bootMs = boot.elapsedMs;

    for (const c of checks) {
      const cmd = await sendCommand(page, example, c.cmd, c.expect, c.name);
      result.metrics.commandMs[c.name] = cmd.elapsedMs;
      result.checks.push({ name: c.name, ok: true });
    }

    result.ok = true;
  } catch (e) {
    result.error = e.message || String(e);
  }

  result.logsTail = logs.slice(-60);
  result.termTail = (await page.evaluate(() => document.getElementById('term')?.textContent || '')).slice(-1200);
  await page.close();
  return result;
}

function summarizePerf(results) {
  const examples = {};
  for (const r of results) {
    examples[r.example] = {
      bootMs: r.metrics.bootMs,
      commandMs: r.metrics.commandMs,
    };
  }
  return {
    updatedAt: new Date().toISOString(),
    bootTimeoutMs: BOOT_TIMEOUT_MS,
    cmdTimeoutMs: CMD_TIMEOUT_MS,
    examples,
  };
}

function loadPerfBaseline() {
  if (!existsSync(PERF_BASELINE_PATH)) return null;
  return JSON.parse(readFileSync(PERF_BASELINE_PATH, 'utf8'));
}

function savePerfBaseline(data) {
  mkdirSync(dirname(PERF_BASELINE_PATH), { recursive: true });
  writeFileSync(PERF_BASELINE_PATH, `${JSON.stringify(data, null, 2)}\n`);
}

function evalPerfNonRegression(current, baseline) {
  const failures = [];
  const baselineExamples = baseline?.examples || {};
  const currentExamples = current?.examples || {};

  for (const [name, b] of Object.entries(baselineExamples)) {
    const c = currentExamples[name];
    if (!c) {
      failures.push(`missing current perf data for example=${name}`);
      continue;
    }

    if (Number.isFinite(b.bootMs) && Number.isFinite(c.bootMs)) {
      const cap = b.bootMs * (1 + PERF_TOLERANCE);
      if (c.bootMs > cap) {
        failures.push(`${name} bootMs regressed: current=${c.bootMs} baseline=${b.bootMs} tolerance=${PERF_TOLERANCE}`);
      }
    }

    const bCmd = b.commandMs || {};
    const cCmd = c.commandMs || {};
    for (const [cmdName, bMs] of Object.entries(bCmd)) {
      const cMs = cCmd[cmdName];
      if (!Number.isFinite(bMs) || !Number.isFinite(cMs)) {
        failures.push(`${name} ${cmdName} missing timing (current=${cMs}, baseline=${bMs})`);
        continue;
      }
      const cap = bMs * (1 + PERF_TOLERANCE);
      if (cMs > cap) {
        failures.push(`${name} ${cmdName} regressed: current=${cMs} baseline=${bMs} tolerance=${PERF_TOLERANCE}`);
      }
    }
  }

  return failures;
}

async function main() {
  const server = await startServer();
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const alpine = await runExample(browser, 'alpine', [
      { name: 'alpine echo', cmd: 'echo GD_ALPINE_OK', expect: /GD_ALPINE_OK/ },
      {
        name: 'alpine file sha256',
        cmd: "printf 'hello-golden\\n' > /tmp/gd.txt; sha256sum /tmp/gd.txt | awk '{print $1}'",
        expect: /d3134f8fbed1c93f9fcdc3cab4a5871be9ffa5542847aa14a8fc88f243f099a5/,
      },
    ]);

    const node = await runExample(browser, 'nodejs', [
      { name: 'node stdin', cmd: 'x', expect: /\bOK\b/ },
    ]);

    const serverDemo = await runExample(browser, 'server', []);

    const all = [alpine, node, serverDemo];
    for (const r of all) {
      console.log(`\n[${r.ok ? 'PASS' : 'FAIL'}] ${r.example}`);
      if (r.error) console.log(`error: ${r.error}`);
      if (r.pageErrors.length) console.log(`pageErrors: ${r.pageErrors.join(' || ')}`);
      console.log(`metrics: bootMs=${r.metrics.bootMs ?? 'n/a'} commandMs=${JSON.stringify(r.metrics.commandMs)}`);
      console.log(`termTail: ${r.termTail.replace(/\s+/g, ' ').slice(0, 240)}`);
      if (!r.ok && r.logsTail.length) {
        console.log(`logsTail: ${r.logsTail.join(' || ').slice(0, 600)}`);
      }
    }

    const passCount = all.filter((r) => r.ok).length;
    console.log(`\n[SUMMARY] pass=${passCount}/${all.length}`);
    let perfOk = true;
    let perfFailures = [];
    const perfCurrent = summarizePerf(all);
    const perfBaseline = loadPerfBaseline();
    if (UPDATE_BASELINE || !perfBaseline) {
      savePerfBaseline(perfCurrent);
      console.log(`[PERF] baseline ${perfBaseline ? 'updated' : 'created'}: ${PERF_BASELINE_PATH}`);
    } else {
      perfFailures = evalPerfNonRegression(perfCurrent, perfBaseline);
      if (perfFailures.length > 0) {
        perfOk = false;
        for (const f of perfFailures) console.log(`[PERF][FAIL] ${f}`);
      } else {
        console.log(`[PERF] non-regression PASS vs ${PERF_BASELINE_PATH}`);
      }
    }

    process.exit(passCount === all.length && perfOk ? 0 : 1);
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill('SIGTERM');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
