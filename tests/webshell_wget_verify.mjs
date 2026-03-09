#!/usr/bin/env node
import puppeteer from 'puppeteer';

const PORT = Number(process.env.FRISCY_PORT || 9010);
const BASE = `http://127.0.0.1:${PORT}`;

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

async function dumpTerm(page) {
  return await page.evaluate(() => {
    const t = window._friscyTerm;
    if (!t || !t.buffer || !t.buffer.active) return '';
    const buf = t.buffer.active;
    const lines = [];
    for (let i = 0; i < buf.length; i++) {
      const line = buf.getLine(i);
      if (line) lines.push(line.translateToString(true));
    }
    return lines.slice(-220).join('\n');
  });
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
  page.setDefaultTimeout(10 * 60 * 1000);

  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[worker]') || text.includes('startup failed')) {
      console.log(`[console:${msg.type()}] ${text}`);
    }
  });

  try {
    await page.goto(`${BASE}/?example=claude-tui`, { waitUntil: 'networkidle2', timeout: 300000 });
    await waitFor(
      () => page.evaluate(() => Boolean(window._friscyStdinQueue && window._friscyAwaitStdinRequest && window._friscyTerm)),
      300000,
      'webshell hooks'
    );

    await waitStdin(page, 120000);
    const cmd = 'wget -T 10 -t 1 -qO- http://example.com | head -n 1\n';
    console.log('[verify] running:', cmd.trim());
    await sendInput(page, cmd);

    await sleep(12000);
    const term = await dumpTerm(page);
    const ok = /<!doctype html>|<html/i.test(term);

    console.log(`[verify] dns/connect/http via wget: ${ok ? 'PASS' : 'FAIL'}`);
    if (!ok) {
      const tail = term.split('\n').slice(-40).join('\n');
      console.log('[verify] terminal tail:\n' + tail);
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
})();
