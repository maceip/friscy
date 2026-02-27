#!/usr/bin/env node
import puppeteer from 'puppeteer';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const BASE = process.env.GOLDEN_BASE_URL || 'http://127.0.0.1:9095/';
const START_AT = new Date().toISOString();
const BOOT_TIMEOUT_MS = 240000;
const CMD_TIMEOUT_MS = 180000;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function waitRunning(page) {
  const t0 = Date.now();
  while (Date.now() - t0 < BOOT_TIMEOUT_MS) {
    const status = await page.evaluate(() => document.getElementById('status')?.textContent || '');
    if (status.includes('running:alpine')) return Date.now() - t0;
    if (status === 'error' || /^exit:/.test(status)) throw new Error(`alpine boot failed: ${status}`);
    await sleep(250);
  }
  throw new Error('alpine boot timeout');
}

async function runGitAction(page, tag) {
  const probe = `0123456789012345678901234567890123456789-${tag}-${Date.now()}`;
  const expect = /\bmissing\b/;

  const before = await page.evaluate(() => document.getElementById('term')?.textContent || '');
  await page.evaluate((text) => {
    const input = document.getElementById('cmd');
    const send = document.getElementById('send');
    input.value = text;
    send.click();
  }, probe);

  const t0 = Date.now();
  while (Date.now() - t0 < CMD_TIMEOUT_MS) {
    const status = await page.evaluate(() => document.getElementById('status')?.textContent || '');
    const term = await page.evaluate(() => document.getElementById('term')?.textContent || '');
    const delta = term.length >= before.length ? term.slice(before.length) : term;
    if (expect.test(delta)) return Date.now() - t0;
    if (status === 'error' || /^exit:/.test(status)) throw new Error(`alpine git action failed: ${status}`);
    await sleep(250);
  }
  throw new Error('alpine git action timeout');
}

async function exportCkpt(page, name) {
  const t0 = Date.now();
  await page.evaluate(async (filename) => {
    const out = await window.__goldenExportLiveCheckpoint();
    const bytes = new Uint8Array(out.data);
    const resp = await fetch(`/__upload_checkpoint/${filename}`, { method: 'POST', body: bytes });
    const text = await resp.text();
    if (!resp.ok) throw new Error(`upload failed HTTP ${resp.status}: ${text}`);
  }, name);
  return Date.now() - t0;
}

function sum(path) { return execSync(`sha256sum ${path}`).toString().trim().split(/\s+/)[0]; }
function size(path) { return Number(execSync(`stat -c%s ${path}`).toString().trim()); }

function url(example = 'alpine', ckpt = null) {
  const u = new URL(BASE);
  if (example !== 'alpine') u.searchParams.set('example', example);
  if (ckpt) u.searchParams.set('ckpt', ckpt);
  u.searchParams.set('t', Date.now().toString());
  return u.toString();
}

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
const result = { at: START_AT, example: 'alpine', ok: false, timings: {}, checkpoints: {}, error: null };

try {
  console.log('[alpine] boot0');
  await page.goto(url('alpine'), { waitUntil: 'domcontentloaded', timeout: 60000 });
  result.timings.boot0Ms = await waitRunning(page);
  result.timings.action0Ms = await runGitAction(page, 's0');
  result.timings.export1Ms = await exportCkpt(page, 'alpine-stage1.ckpt');

  console.log('[alpine] boot1');
  await page.goto(url('alpine', '/docs_site/alpine-stage1.ckpt'), { waitUntil: 'domcontentloaded', timeout: 60000 });
  result.timings.boot1Ms = await waitRunning(page);
  result.timings.action1Ms = await runGitAction(page, 's1');
  result.timings.export2Ms = await exportCkpt(page, 'alpine-stage2.ckpt');

  console.log('[alpine] boot2');
  await page.goto(url('alpine', '/docs_site/alpine-stage2.ckpt'), { waitUntil: 'domcontentloaded', timeout: 60000 });
  result.timings.boot2Ms = await waitRunning(page);
  result.timings.action2Ms = await runGitAction(page, 's2');

  result.checkpoints.stage1 = {
    path: 'docs_site/alpine-stage1.ckpt',
    bytes: size('docs_site/alpine-stage1.ckpt'),
    sha256: sum('docs_site/alpine-stage1.ckpt'),
  };
  result.checkpoints.stage2 = {
    path: 'docs_site/alpine-stage2.ckpt',
    bytes: size('docs_site/alpine-stage2.ckpt'),
    sha256: sum('docs_site/alpine-stage2.ckpt'),
  };
  result.ok = true;
} catch (e) {
  result.error = e?.message || String(e);
}

result.termTail = await page.evaluate(() => (document.getElementById('term')?.textContent || '').slice(-2000)).catch(() => '');
await page.close().catch(() => {});
await browser.close().catch(() => {});

mkdirSync('docs/generated', { recursive: true });
writeFileSync('docs/generated/alpine_checkpoint_ladder_report.json', `${JSON.stringify(result, null, 2)}\n`);
appendFileSync('docs/RUN-JOURNAL.md', `\n## ${START_AT} Alpine checkpoint ladder\n- ${result.ok ? 'PASS' : `FAIL (${result.error})`}\n`);
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
