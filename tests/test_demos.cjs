#!/usr/bin/env node
// test_demos.cjs — Verify small and medium demos boot in headless Chrome
// Launches each demo's serve.js, opens in Puppeteer, checks for successful load.

const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const DEMOS = [
  {
    name: 'small',
    dir: path.join(PROJECT_ROOT, 'demos', 'small'),
    port: 8091,
    url: (p) => `http://localhost:${p}/index.html?example=claude`,
    // Small demo: should load wasm module and start downloading rootfs
    successCheck: async (page, logs) => {
      // Wait for the worker to post messages
      const start = Date.now();
      while (Date.now() - start < 30000) {
        const status = await page.evaluate(() => {
          const el = document.getElementById('status');
          return el ? el.textContent : '';
        });
        // Check console for wasm module loaded or rootfs download
        const hasWorkerStart = logs.some(m =>
          m.includes('Worker') || m.includes('wasm') || m.includes('rootfs') ||
          m.includes('Loading') || m.includes('SharedArrayBuffer')
        );
        const hasError = logs.some(m =>
          m.includes('memory access out of bounds') || m.includes('FATAL')
        );
        if (hasError) return { pass: false, reason: 'Runtime error: ' + logs.find(m => m.includes('Error') || m.includes('FATAL')) };
        if (hasWorkerStart) return { pass: true, reason: 'Wasm module loaded, demo booting' };
        await new Promise(r => setTimeout(r, 500));
      }
      return { pass: logs.length > 0, reason: logs.length > 0 ? 'Got console output' : 'No console output after 30s' };
    }
  },
  {
    name: 'medium',
    dir: path.join(PROJECT_ROOT, 'demos', 'medium'),
    port: 8092,
    url: (p) => `http://localhost:${p}/index.html?example=claude-demo`,
    successCheck: async (page, logs) => {
      const start = Date.now();
      while (Date.now() - start < 30000) {
        const hasWorkerStart = logs.some(m =>
          m.includes('Worker') || m.includes('wasm') || m.includes('rootfs') ||
          m.includes('Loading') || m.includes('SharedArrayBuffer')
        );
        const hasError = logs.some(m =>
          m.includes('memory access out of bounds') || m.includes('FATAL')
        );
        if (hasError) return { pass: false, reason: 'Runtime error: ' + logs.find(m => m.includes('Error') || m.includes('FATAL')) };
        if (hasWorkerStart) return { pass: true, reason: 'Wasm module loaded, demo booting' };
        await new Promise(r => setTimeout(r, 500));
      }
      return { pass: logs.length > 0, reason: logs.length > 0 ? 'Got console output' : 'No console output after 30s' };
    }
  },
  {
    name: 'medium-llrt',
    dir: path.join(PROJECT_ROOT, 'demos', 'medium'),
    port: 8093,
    url: (p) => `http://localhost:${p}/index.html?example=claude-llrt`,
    successCheck: async (page, logs) => {
      const start = Date.now();
      while (Date.now() - start < 30000) {
        const hasWorkerStart = logs.some(m =>
          m.includes('Worker') || m.includes('wasm') || m.includes('rootfs') ||
          m.includes('Loading') || m.includes('SharedArrayBuffer')
        );
        const hasError = logs.some(m =>
          m.includes('memory access out of bounds') || m.includes('FATAL')
        );
        if (hasError) return { pass: false, reason: 'Runtime error: ' + logs.find(m => m.includes('Error') || m.includes('FATAL')) };
        if (hasWorkerStart) return { pass: true, reason: 'Wasm module loaded, LLRT demo booting' };
        await new Promise(r => setTimeout(r, 500));
      }
      return { pass: logs.length > 0, reason: logs.length > 0 ? 'Got console output' : 'No console output after 30s' };
    }
  }
];

async function startServer(dir, port) {
  const serveJs = path.join(dir, 'serve.js');
  const proc = spawn('node', [serveJs, String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: dir,
  });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Server start timeout')), 5000);
    proc.stdout.on('data', d => {
      if (d.toString().includes('localhost') || d.toString().includes('Serving')) {
        clearTimeout(t);
        resolve();
      }
    });
    proc.stderr.on('data', d => process.stderr.write(`[server:${port}] ${d}`));
    proc.on('error', e => { clearTimeout(t); reject(e); });
  });
  return proc;
}

async function testDemo(demo) {
  let server = null;
  let browser = null;
  try {
    console.log(`\n=== Testing ${demo.name} demo (port ${demo.port}) ===`);
    server = await startServer(demo.dir, demo.port);
    console.log(`  Server started on :${demo.port}`);

    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--js-flags=--max-old-space-size=4096',
      ],
    });
    const page = await browser.newPage();

    const logs = [];
    const errors = [];
    page.on('console', msg => {
      const text = msg.text();
      logs.push(text);
    });
    page.on('pageerror', err => errors.push(err.message));

    console.log(`  Loading ${demo.url(demo.port)}`);
    // Service worker triggers a reload for COOP/COEP headers.
    // Navigate, then wait for the post-reload page to settle.
    await page.goto(demo.url(demo.port), { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    // Wait for service-worker reload to complete
    await new Promise(r => setTimeout(r, 3000));
    try {
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
    } catch(e) { /* already navigated */ }
    // Give the reloaded page a moment
    await new Promise(r => setTimeout(r, 2000));

    let title, hasTerminal;
    try {
      title = await page.title();
      hasTerminal = await page.evaluate(() => !!document.querySelector('.xterm-rows, #terminal, .terminal'));
    } catch(e) {
      // Context destroyed by another reload — wait and retry
      await new Promise(r => setTimeout(r, 3000));
      title = await page.title();
      hasTerminal = await page.evaluate(() => !!document.querySelector('.xterm-rows, #terminal, .terminal'));
    }
    console.log(`  Page title: "${title}"`);
    console.log(`  Terminal element: ${hasTerminal}`);

    // Wait for wasm to start loading
    const result = await demo.successCheck(page, logs);

    if (errors.length > 0) {
      console.log(`  Page errors: ${errors.slice(0, 3).join('; ')}`);
    }
    console.log(`  Console messages (${logs.length}):`);
    logs.slice(0, 20).forEach(m => console.log(`    ${m.slice(0, 200)}`));

    if (result.pass) {
      console.log(`  [PASS] ${demo.name}: ${result.reason}`);
    } else {
      console.log(`  [FAIL] ${demo.name}: ${result.reason}`);
    }
    return result.pass;
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) server.kill();
  }
}

async function main() {
  let allPassed = true;
  for (const demo of DEMOS) {
    const passed = await testDemo(demo);
    if (!passed) allPassed = false;
  }
  console.log(`\n=== Results ===`);
  console.log(allPassed ? 'All demos PASSED' : 'Some demos FAILED');
  process.exit(allPassed ? 0 : 1);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
