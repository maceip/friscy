#!/usr/bin/env node
import puppeteer from 'puppeteer';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const BASE = process.env.GOLDEN_BASE_URL || 'http://127.0.0.1:9095/';
const BOOT_TIMEOUT_MS = Number.parseInt(process.env.GOLDEN_BOOT_TIMEOUT_MS || '90000', 10);
const CMD_TIMEOUT_MS = Number.parseInt(process.env.GOLDEN_CMD_TIMEOUT_MS || '120000', 10);
const START_AT = new Date().toISOString();
const COMMAND_ERROR_RE = /\b(SyntaxError|ReferenceError|TypeError|Error:|UnhandledPromiseRejection|MachineException|bad_alloc)\b/;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRunning(page, example) {
  const t0 = Date.now();
  while (Date.now() - t0 < BOOT_TIMEOUT_MS) {
    const snap = await page.evaluate(() => ({
      status: document.getElementById('status')?.textContent || '',
      boot: document.getElementById('boot')?.textContent || '',
      term: document.getElementById('term')?.textContent || '',
    }));
    if (snap.status.includes(`running:${example}`)) {
      return { ms: Date.now() - t0, snap };
    }
    if (snap.status === 'error' || /^exit:/.test(snap.status) || /boot error/i.test(snap.term)) {
      throw new Error(`boot failed for ${example}: status=${snap.status} boot=${snap.boot}`);
    }
    await sleep(250);
  }
  throw new Error(`boot timeout for ${example}`);
}

async function sendCommand(page, command, expectRe, label, opts = {}) {
  const failOnError = opts.failOnError !== false;
  const before = await page.evaluate(() => document.getElementById('term')?.textContent || '');
  await page.evaluate((text) => {
    const input = document.getElementById('cmd');
    const send = document.getElementById('send');
    input.value = text;
    send.click();
  }, command);

  const t0 = Date.now();
  while (Date.now() - t0 < CMD_TIMEOUT_MS) {
    const snap = await page.evaluate(() => ({
      status: document.getElementById('status')?.textContent || '',
      term: document.getElementById('term')?.textContent || '',
    }));
    const delta = snap.term.length >= before.length ? snap.term.slice(before.length) : snap.term;
    if (failOnError && COMMAND_ERROR_RE.test(delta)) {
      throw new Error(`${label} error output detected: ${delta.slice(0, 220).replace(/\s+/g, ' ')}`);
    }
    if (expectRe.test(delta)) {
      return { ms: Date.now() - t0, delta };
    }
    if (snap.status === 'error' || /^exit:/.test(snap.status)) {
      throw new Error(`${label} aborted: status=${snap.status}`);
    }
    await sleep(200);
  }
  throw new Error(`${label} timeout`);
}

async function waitForTerm(page, expectRe, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < CMD_TIMEOUT_MS) {
    const snap = await page.evaluate(() => ({
      status: document.getElementById('status')?.textContent || '',
      term: document.getElementById('term')?.textContent || '',
    }));
    if (expectRe.test(snap.term)) {
      return { ms: Date.now() - t0 };
    }
    if (snap.status === 'error' || /^exit:/.test(snap.status)) {
      throw new Error(`${label} aborted: status=${snap.status}`);
    }
    await sleep(200);
  }
  throw new Error(`${label} timeout`);
}

async function exportCheckpointToFile(page, filename) {
  const t0 = Date.now();
  const upload = await page.evaluate(async (name) => {
    if (!window.__goldenExportLiveCheckpoint) {
      throw new Error('__goldenExportLiveCheckpoint missing');
    }
    const out = await window.__goldenExportLiveCheckpoint();
    const bytes = new Uint8Array(out.data);
    const resp = await fetch(`/__upload_checkpoint/${name}`, { method: 'POST', body: bytes });
    const text = await resp.text();
    if (!resp.ok) throw new Error(`upload failed HTTP ${resp.status}: ${text}`);
    return JSON.parse(text);
  }, filename);
  return { ms: Date.now() - t0, upload };
}

function sha256(path) {
  return execSync(`sha256sum ${path}`).toString().trim().split(/\s+/)[0];
}

function bytes(path) {
  return Number(execSync(`stat -c%s ${path}`).toString().trim());
}

function openUrl(base, example, ckpt = null) {
  const u = new URL(base);
  u.searchParams.set('example', example);
  if (ckpt) u.searchParams.set('ckpt', ckpt);
  u.searchParams.set('t', Date.now().toString());
  return u.toString();
}

async function loadManifest() {
  const u = new URL('/manifest.json', BASE);
  const resp = await fetch(u);
  if (!resp.ok) throw new Error(`manifest fetch failed: GET ${u.toString()} -> HTTP ${resp.status}`);
  return await resp.json();
}

async function preflightBase() {
  const checks = ['/'];
  for (const path of checks) {
    const u = new URL(path, BASE);
    const resp = await fetch(u);
    if (!resp.ok) {
      throw new Error(`preflight failed: GET ${u.toString()} -> HTTP ${resp.status}`);
    }
  }
}

async function runLadder(browser, example, action, boot0Ckpt = null) {
  const page = await browser.newPage();
  const out = {
    example,
    ok: false,
    error: null,
    timings: {},
    checkpoints: {},
    termTail: '',
  };
  try {
    const ckpt1Name = `${example}-stage1.ckpt`;
    const ckpt2Name = `${example}-stage2.ckpt`;
    const ckpt1Path = `docs_site/${ckpt1Name}`;
    const ckpt2Path = `docs_site/${ckpt2Name}`;

    console.log(`[${example}] boot0: navigating`);
    await page.goto(openUrl(BASE, example, boot0Ckpt), { waitUntil: 'domcontentloaded', timeout: 60000 });
    out.timings.boot0Ms = (await waitForRunning(page, example)).ms;
    console.log(`[${example}] boot0: ${out.timings.boot0Ms}ms`);
    out.timings.action0Ms = await action(page);
    console.log(`[${example}] action0: ${out.timings.action0Ms}ms`);
    out.timings.export1Ms = (await exportCheckpointToFile(page, ckpt1Name)).ms;
    console.log(`[${example}] export1: ${out.timings.export1Ms}ms`);

    console.log(`[${example}] boot1: navigating`);
    await page.goto(openUrl(BASE, example, `/docs_site/${ckpt1Name}`), { waitUntil: 'domcontentloaded', timeout: 60000 });
    out.timings.boot1Ms = (await waitForRunning(page, example)).ms;
    console.log(`[${example}] boot1: ${out.timings.boot1Ms}ms`);
    out.timings.action1Ms = await action(page);
    console.log(`[${example}] action1: ${out.timings.action1Ms}ms`);
    out.timings.export2Ms = (await exportCheckpointToFile(page, ckpt2Name)).ms;
    console.log(`[${example}] export2: ${out.timings.export2Ms}ms`);

    console.log(`[${example}] boot2: navigating`);
    await page.goto(openUrl(BASE, example, `/docs_site/${ckpt2Name}`), { waitUntil: 'domcontentloaded', timeout: 60000 });
    out.timings.boot2Ms = (await waitForRunning(page, example)).ms;
    console.log(`[${example}] boot2: ${out.timings.boot2Ms}ms`);
    out.timings.action2Ms = await action(page);
    console.log(`[${example}] action2: ${out.timings.action2Ms}ms`);

    out.checkpoints.stage1 = { path: ckpt1Path, bytes: bytes(ckpt1Path), sha256: sha256(ckpt1Path) };
    out.checkpoints.stage2 = { path: ckpt2Path, bytes: bytes(ckpt2Path), sha256: sha256(ckpt2Path) };
    out.ok = true;
  } catch (e) {
    out.error = e?.message || String(e);
  } finally {
    out.termTail = await page.evaluate(() => (document.getElementById('term')?.textContent || '').slice(-1600)).catch(() => '');
    await page.close().catch(() => {});
  }
  return out;
}

async function main() {
  const only = (process.env.ONLY_EXAMPLE || '').trim();
  await preflightBase();
  const manifest = await loadManifest();
  const nodeManifestCkpt = manifest?.examples?.nodejs?.checkpoint || null;
  const nodeBoot0Ckpt = process.env.NODE_BOOT0_CKPT || nodeManifestCkpt;
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const alpineAction = async (page) => {
      const probe = `0123456789012345678901234567890123456789-${Date.now()}`;
      return (await sendCommand(page, probe, /\bmissing\b/, 'alpine git op')).ms;
    };
    const nodeAction = async (page) => {
      return (await sendCommand(
        page,
        "require('crypto').createHash('sha256').update('your_string_here').digest('hex');",
        /31a978a76555747c85c9a240624de85ca063df982c1791c349726f1de55c32cd/,
        'node sha256',
      )).ms;
    };
    const serverAction = async (page) => {
      const t0 = Date.now();
      while (Date.now() - t0 < 30000) {
        const st = await page.evaluate(() => document.getElementById('status')?.textContent || '');
        if (st.includes('running:server')) return Date.now() - t0;
        if (st === 'error' || /^exit:/.test(st)) throw new Error(`go server not running: ${st}`);
        await sleep(200);
      }
      throw new Error('go server running-state timeout');
    };

    const selected = only ? [only] : ['alpine', 'nodejs', 'server'];
    const results = [];
    for (const ex of selected) {
      if (ex === 'alpine') results.push(await runLadder(browser, 'alpine', alpineAction, 'none'));
      else if (ex === 'nodejs') {
        if (!nodeBoot0Ckpt) throw new Error('nodejs boot0 checkpoint is missing (set NODE_BOOT0_CKPT or manifest.examples.nodejs.checkpoint)');
        results.push(await runLadder(browser, 'nodejs', nodeAction, nodeBoot0Ckpt));
      }
      else if (ex === 'server') results.push(await runLadder(browser, 'server', serverAction, 'none'));
      else throw new Error(`unknown ONLY_EXAMPLE=${ex}`);
      console.log(`[result:${ex}] ${JSON.stringify(results[results.length - 1])}`);
    }

    const report = {
      at: START_AT,
      baseUrl: BASE,
      bootTimeoutMs: BOOT_TIMEOUT_MS,
      cmdTimeoutMs: CMD_TIMEOUT_MS,
      results,
      passCount: results.filter((r) => r.ok).length,
      total: results.length,
    };
    mkdirSync('docs/generated', { recursive: true });
    writeFileSync('docs/generated/golden_demo_checkpoint_ladders_report.json', `${JSON.stringify(report, null, 2)}\n`);
    appendFileSync('docs/RUN-JOURNAL.md',
      `\n## ${START_AT} 3-demo checkpoint continuity ladders\n` +
      results.map((r) => `- ${r.example}: ${r.ok ? 'PASS' : `FAIL (${r.error})`}`).join('\n') + '\n');

    console.log(JSON.stringify(report, null, 2));
    process.exit(report.passCount === report.total ? 0 : 1);
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
