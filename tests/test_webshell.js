#!/usr/bin/env node
// test_webshell.js - Headless Chrome test for friscy web shell
//
// Tests:
//   1. Shell boots and shows prompt
//   2. echo-server runs via execve without crash
//   3. Network proxy connects
//
// Usage: node tests/test_webshell.js

const puppeteer = require('puppeteer');

const URL = 'http://localhost:8080';
const BOOT_TIMEOUT = 60000;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const allLogs = [];
  const errors = [];
  const results = {};

  console.log('[test] Launching headless Chrome...');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--enable-features=WebTransport,WebAssemblyExperimentalJSPI',
      '--enable-experimental-web-platform-features',
    ],
  });

  const page = await browser.newPage();

  // Capture all console messages
  page.on('console', msg => {
    const text = msg.text();
    allLogs.push({ type: msg.type(), text, ts: Date.now() });
  });

  page.on('pageerror', err => {
    errors.push(err.message);
    allLogs.push({ type: 'pageerror', text: err.message, ts: Date.now() });
  });

  try {
    // ============ TEST 1: Shell boots ============
    console.log('[test] Loading web shell...');
    await page.goto(URL, { waitUntil: 'networkidle2', timeout: BOOT_TIMEOUT });

    // Wait for shell to boot (simulate() returns)
    const shellBooted = await waitForLog(allLogs, 'simulate() returned normally', 40000);
    results.shellBoot = shellBooted;
    console.log(`[test] Shell boot: ${shellBooted ? 'PASS' : 'FAIL'}`);

    // Check network
    await sleep(3000);
    const netConnected = allLogs.some(l => l.text.includes('[friscy-net] Connected to proxy'));
    results.network = netConnected;
    console.log(`[test] Network proxy: ${netConnected ? 'PASS' : 'FAIL'}`);

    // Check tty warning
    const ttyWarning = allLogs.some(l => l.text.includes("can't access tty"));
    results.ttyClean = !ttyWarning;
    console.log(`[test] TTY clean (no warning): ${!ttyWarning ? 'PASS' : 'FAIL'}`);

    // Check JSPI error
    const jspiError = allLogs.some(l => l.text.includes('SuspendError'));
    results.jspiOk = !jspiError;
    console.log(`[test] JSPI (no SuspendError): ${!jspiError ? 'PASS' : 'FAIL'}`);

    if (!shellBooted) {
      console.log('[test] Shell didn\'t boot, skipping command tests');
    } else {
      // ============ TEST 2: Run echo-server ============
      console.log('[test] Typing echo-server command...');
      await typeCommand(page, '/usr/local/bin/echo-server\n');

      // Wait for either success or crash
      const echoResult = await Promise.race([
        waitForLog(allLogs, 'http server started', 30000).then(() => 'started'),
        waitForLog(allLogs, 'starting server on', 30000).then(() => 'starting'),
        waitForLog(allLogs, 'execve: jumping to', 20000).then(() => 'execve-ok'),
        waitForLog(allLogs, 'fatal error', 20000).then(() => 'fatal'),
        waitForLog(allLogs, 'Execution space protection', 20000).then(() => 'exec-fault'),
        waitForLog(allLogs, 'Max execute segments', 20000).then(() => 'seg-limit'),
        sleep(35000).then(() => 'timeout'),
      ]);
      results.echoServer = echoResult;
      console.log(`[test] Echo server: ${echoResult}`);

      // Check for page size error specifically
      const pageSizeError = allLogs.some(l => l.text.includes('failed to get system page size'));
      results.pageSizeOk = !pageSizeError;
      console.log(`[test] Page size (no error): ${!pageSizeError ? 'PASS' : 'FAIL'}`);
    }

  } catch (e) {
    errors.push(`Test error: ${e.message}`);
    console.error(`[test] EXCEPTION: ${e.message}`);
  }

  await browser.close();

  // ============ REPORT ============
  console.log('\n========== RESULTS ==========');
  for (const [k, v] of Object.entries(results)) {
    const pass = v === true || v === 'started' || v === 'starting' || v === 'execve-ok';
    console.log(`  ${pass ? 'PASS' : 'FAIL'} ${k}: ${v}`);
  }

  if (errors.length > 0) {
    console.log('\n--- PAGE ERRORS ---');
    errors.forEach(e => console.log(`  ${e}`));
  }

  // Print ALL logs for debugging
  console.log('\n--- ALL LOGS ---');
  allLogs.forEach(l => {
    console.log(`  [${l.type}] ${l.text.substring(0, 300)}`);
  });

  const allPassed = Object.values(results).every(v =>
    v === true || v === 'started' || v === 'starting' || v === 'execve-ok');
  console.log(`\n${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);
  process.exit(allPassed ? 0 : 1);
})();

async function waitForLog(logs, text, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (logs.some(l => l.text.includes(text))) return true;
    await sleep(300);
  }
  return false;
}

async function typeCommand(page, cmd) {
  await page.evaluate((text) => {
    const buf = window._friscyInput;
    if (!buf) {
      console.error('[test] No stdin buffer found!');
      return;
    }
    const encoder = new TextEncoder();
    const bytes = encoder.encode(text);
    for (const b of bytes) buf.push(b);

    // Trigger resume if needed
    if (typeof window._friscyScheduleResume === 'function') window._friscyScheduleResume();
  }, cmd);
}
