#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer';

const BASE_PORT = Number(process.env.FRISCY_PORT || (19000 + Math.floor(Math.random() * 1000)));
const FORCE_BASE_URL = process.env.FRISCY_URL;
const OUTPUT_DIR = process.env.FRISCY_ARTIFACT_DIR || join(process.cwd(), 'tests', 'artifacts');
const OUT_PREFIX = process.env.FRISCY_PROOF_PREFIX || 'friscy-process-proof';
const COMMAND = process.env.FRISCY_COMMAND || '/bin/sh -lc "echo hi; exec </dev/null; exec >/dev/null; exec 2>/dev/null; /bin/true"';
const STARTUP_CMD = process.env.FRISCY_STARTUP_CMD || '(/bin/echo hi)& wait';
const EXAMPLE = process.env.FRISCY_EXAMPLE || 'alpine';
const BROWSER_TIMEOUT = Number(process.env.FRISCY_BROWSER_TIMEOUT_MS || 120000);
const PROOF_TIMEOUT = Number(process.env.FRISCY_PROOF_TIMEOUT_MS || 90000);
const NO_SERVICE_WORKER = process.env.FRISCY_NO_SERVICE_WORKER !== '0';
const EXTRA_BROWSER_ARGS = (process.env.FRISCY_BROWSER_ARGS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function now() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function stripAnsi(input) {
  return String(input || '')
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/\x1b\[[?]?[0-9;]*[A-Za-z]/g, '');
}

function summarize(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (!text) return text;
  if (text.length <= 1800) return text;
  return `${text.slice(0, 900)}...${text.slice(-900)}`;
}

function buildBrowserArgs() {
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
  ];
  if (NO_SERVICE_WORKER) {
    args.push('--disable-features=ServiceWorker');
  }
  args.push(...EXTRA_BROWSER_ARGS);
  return args;
}

async function waitForCondition(page, predicate, timeoutMs, pollMs = 250) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    last = await page.evaluate(predicate);
    if (last) return last;
    await sleep(pollMs);
  }
  return last;
}

async function waitForServer(child, baseUrl, timeoutMs = 12000) {
  const started = new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        reject(new Error(`server timeout after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    const finish = (error) => {
      if (done) return;
      done = true;
      child.stdout?.off('data', onStdout);
      child.stderr?.off('data', onStderr);
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };

    const onStdout = (chunk) => {
      const text = String(chunk || '');
      if (text.includes('Server running at')) {
        finish();
      }
    };
    child.stdout?.on('data', onStdout);

    const onStderr = (chunk) => {
      const text = String(chunk || '');
      if (/EADDRINUSE|already in use|Address already in use/i.test(text)) {
        finish(new Error(`port in use for ${baseUrl}`));
      }
    };
    child.stderr?.on('data', onStderr);

    child.on('exit', (code, signal) => {
      finish(new Error(`server exited early code=${code} signal=${signal}`));
    });
  });

  const pollHttp = (async () => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const r = await fetch(baseUrl);
        if (r && r.status >= 200 && r.status < 300) return;
      } catch {
      }
      await sleep(250);
    }
    throw new Error(`server not reachable at ${baseUrl}`);
  })();

  return Promise.race([started, pollHttp]);
}

async function injectCommand(page, command) {
  const pushed = await page.evaluate((cmd) => {
    const queue = window._friscyStdinQueue;
    if (!queue || !Array.isArray(queue)) return false;
    const data = new TextEncoder().encode(`${cmd}\n`);
    for (let i = 0; i < data.length; i++) {
      queue.push(data[i]);
    }
    return data.length;
  }, command);
  return Number(pushed) > 0;
}

async function fallbackTypeCommand(page, command) {
  const candidates = [
    '#terminal',
    '#terminal-container',
    '.xterm-screen',
    '.xterm-screen canvas',
    '.xterm',
    'canvas',
    'body',
  ];

  for (const selector of candidates) {
    const handle = await page.$(selector);
    if (!handle) continue;
    try {
      await handle.click();
      await page.keyboard.type(command);
      await page.keyboard.press('Enter');
      return true;
    } catch {
      // keep searching
    }
  }
  return false;
}

function readBootState() {
  return {
    status: document.getElementById('status')?.textContent || '',
    overlayHidden: (() => {
      const overlay = document.getElementById('progress-overlay');
      if (!overlay) return true;
      const style = window.getComputedStyle(overlay);
      return overlay.classList.contains('hidden') || style.display === 'none';
    })(),
    terminalVisible: document.getElementById('terminal')?.style.display !== 'none',
    hasRows: !!document.querySelector('.xterm-rows'),
  };
}

async function snapshot(page, outputDir, outPrefix, tag) {
  const path = `${outputDir}/${outPrefix}-${now()}-${tag}.png`;
  await page.screenshot({ path, fullPage: true });
  return path;
}

async function runProof(page, baseUrl) {
  const startupCmdQuery = `&cmd=${encodeURIComponent(STARTUP_CMD)}`;
  const url = `${baseUrl}/?example=${EXAMPLE}&procdebug${NO_SERVICE_WORKER ? '&nosw' : ''}${startupCmdQuery}`;
  const artifacts = [];
  await page.setViewport({ width: 1600, height: 980 });
  await page.setCacheEnabled(false);

  appendFileSync(OUTPUT_DIR + '/.last-proof-meta.log', `[${new Date().toISOString()}] opening ${url}\n`);
  await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: BROWSER_TIMEOUT,
  });

  artifacts.push(await snapshot(page, OUTPUT_DIR, OUT_PREFIX, '01-loaded'));

  const waitBoot = await waitForCondition(
    page,
    () => {
      const overlay = document.getElementById('progress-overlay');
      const status = document.getElementById('status')?.textContent || '';
      const style = overlay ? window.getComputedStyle(overlay) : null;
      const state = {
        status,
        overlayHidden: !overlay || overlay.classList.contains('hidden') || (style && style.display === 'none'),
        terminalVisible: document.getElementById('terminal')?.style.display !== 'none',
        hasRows: !!document.querySelector('.xterm-rows'),
      };
      if (!state.hasRows) return false;
      if (!state.overlayHidden && state.status && state.status.toLowerCase().includes('boot')) return false;
      return state;
    },
    60000,
  );
  await sleep(800);
  artifacts.push(await snapshot(page, OUTPUT_DIR, OUT_PREFIX, '02-before-cmd'));

  const injected = await injectCommand(page, COMMAND);
  if (!injected) {
    const fallbackInjected = await fallbackTypeCommand(page, COMMAND);
    if (!fallbackInjected) {
      console.log('[proof] command_injection_skipped');
    }
  }
  artifacts.push(await snapshot(page, OUTPUT_DIR, OUT_PREFIX, '03-command-sent'));

  const outputSeen = await waitForCondition(
    page,
    () => {
      const rows = document.querySelector('.xterm-rows');
      return rows ? rows.textContent.includes('hi') : false;
    },
    PROOF_TIMEOUT,
    400,
  );

  const eventsSeen = await waitForCondition(
    page,
    () => {
      const log = window.__friscyProcessEventLog;
      return Array.isArray(log) && log.length > 0;
    },
    PROOF_TIMEOUT,
    400,
  );

  const fieldsPresent = await waitForCondition(
    page,
    () => {
      const log = window.__friscyProcessEventLog;
      if (!Array.isArray(log) || log.length === 0) return false;
      const sample = log.slice(-16);
      return sample.every((entry) => (
        Object.prototype.hasOwnProperty.call(entry, 'kind') &&
        Object.prototype.hasOwnProperty.call(entry, 'pid') &&
        Object.prototype.hasOwnProperty.call(entry, 'ppid') &&
        Object.prototype.hasOwnProperty.call(entry, 'pgid') &&
        Object.prototype.hasOwnProperty.call(entry, 'status')
      ));
    },
    PROOF_TIMEOUT,
    400,
  );

  const proofData = await page.evaluate(() => ({
    ts: new Date().toISOString(),
    url: location.href,
    boot: (() => {
      const overlay = document.getElementById('progress-overlay');
      const statusText = document.getElementById('status')?.textContent || '';
      const style = overlay ? window.getComputedStyle(overlay) : null;
      return {
        status: statusText,
        overlayHidden: !overlay || overlay.classList.contains('hidden') || (style && style.display === 'none'),
        terminalVisible: document.getElementById('terminal')?.style.display !== 'none',
        hasRows: !!document.querySelector('.xterm-rows'),
      };
    })(),
    terminalText: document.querySelector('.xterm-rows')?.textContent || '',
    processEventOverlayVisible: !!document.getElementById('friscy-process-events-overlay'),
    processEventOverlayText: document.getElementById('friscy-process-events-list')?.textContent || '',
    processEvents: (window.__friscyProcessEventLog || []).map((ev) => ({
      kind: ev.kind,
      kindName: ev.kindName,
      pid: ev.pid,
      ppid: ev.ppid,
      pgid: ev.pgid,
      status: ev.status,
    })),
    processEventsLive: (window.__friscyProcessEvents || []).map((ev) => ({
      kind: ev.kind,
      kindName: ev.kindName,
      pid: ev.pid,
      ppid: ev.ppid,
      pgid: ev.pgid,
      status: ev.status,
    })),
    statusText: document.getElementById('status')?.textContent || '',
    browserWindow: {
      hasStdinQueue: Array.isArray(window._friscyStdinQueue),
      hasProcessLog: Array.isArray(window.__friscyProcessEventLog),
      hasProcessEvents: Array.isArray(window.__friscyProcessEvents),
      jitStatsExists: Object.prototype.hasOwnProperty.call(window, '__friscyJitStats'),
    },
  }));

  const proofPath = `${OUTPUT_DIR}/${OUT_PREFIX}-proof-${now()}.json`;
  const eventKinds = new Set(
    (proofData.processEvents || []).map((ev) => ev.kindName || ev.kind || 'unknown'),
  );
  const requiredKinds = ['spawn', 'exit', 'wait_wakeup'];
  const requiredKindsPresent = requiredKinds.every((k) => eventKinds.has(k));
  const waitWakeStatuses = (proofData.processEvents || [])
    .filter((ev) => (ev.kindName || ev.kind) === 'wait_wakeup' || ev.kind === 3)
    .map((ev) => ev.status | 0);
  const waitWakeStatusOk = waitWakeStatuses.length > 0 && waitWakeStatuses.every((s) => s === 0);
  const devNullOpenErrorSeen = String(proofData.terminalText || '').includes("can't open '/dev/null'");

  writeFileSync(proofPath, JSON.stringify({
    ...proofData,
    expectation: {
      command: COMMAND,
      sawCommandOutput: !!outputSeen,
      sawProcessEvents: !!eventsSeen,
      sawProcessEventFields: !!fieldsPresent,
      waitWakeStatuses,
      waitWakeStatusOk,
      devNullOpenErrorSeen,
      commandInjectionUsedQueue: !!injected,
      boot: waitBoot,
      waitMs: PROOF_TIMEOUT,
    },
  }, null, 2));

  artifacts.push(await snapshot(page, OUTPUT_DIR, OUT_PREFIX, '04-final'));

  return {
    proofPath,
    artifacts,
    eventCount: proofData.processEvents?.length || 0,
    eventKinds: Array.from(eventKinds),
    requiredKindsPresent,
    waitWakeStatuses,
    waitWakeStatusOk,
    devNullOpenErrorSeen,
    terminalTail: stripAnsi(proofData.terminalText).slice(-2200),
    outputSeen: !!outputSeen,
    eventsSeen: !!eventsSeen,
    fieldsPresent: !!fieldsPresent,
    boot: proofData.boot,
    overlayText: proofData.processEventOverlayText,
  };
}

async function main() {
  ensureDir(OUTPUT_DIR);
  let server;
  let browser;

  const outputLine = join(OUTPUT_DIR, '.last-proof-meta.log');
  let finalBaseUrl = FORCE_BASE_URL || `http://127.0.0.1:${BASE_PORT}`;
  const maxPortAttempts = 4;

  try {
    if (FORCE_BASE_URL) {
      finalBaseUrl = FORCE_BASE_URL;
    } else {
      const startPort = BASE_PORT;
      let port = BASE_PORT;
      let started = false;
      for (let attempt = 0; attempt < maxPortAttempts; attempt += 1) {
        const baseUrl = `http://127.0.0.1:${port}`;
        const checkUrl = `${baseUrl}/?example=${EXAMPLE}&procdebug`;
        server = spawn('node', ['serve.js', String(port)], {
          cwd: join(process.cwd(), 'friscy-bundle'),
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        try {
          await waitForServer(server, checkUrl, 15000);
          finalBaseUrl = baseUrl;
          started = true;
          break;
        } catch (err) {
          server.kill('SIGTERM');
          server = null;
          if (!/port in use/.test(String(err.message)) || attempt + 1 >= maxPortAttempts) {
            throw err;
          }
          port += 1;
        }
      }

      if (!started) {
        throw new Error(`could not start server on any port from ${startPort} to ${startPort + maxPortAttempts - 1}`);
      }
    }

    browser = await puppeteer.launch({
      headless: true,
      args: buildBrowserArgs(),
    });

    const page = await browser.newPage();
    const consoleLines = [];
    page.on('console', (msg) => {
      const line = `[${msg.type()}] ${msg.text()}`;
      consoleLines.push(line);
      if (line.toLowerCase().includes('error') || line.toLowerCase().includes('memory access')) {
        console.log('[browser]', line);
      }
    });
    page.on('pageerror', (err) => {
      consoleLines.push(`pageerror: ${err.message}`);
      console.error('[browser-error]', err.message);
    });

    const result = await runProof(page, finalBaseUrl);
    await writeFileSync(outputLine, [
      `artifact_dir=${OUTPUT_DIR}`,
      `proof=${result.proofPath}`,
      `artifacts=${result.artifacts.join(',')}`,
      `event_count=${result.eventCount}`,
      `event_kinds=${result.eventKinds.join(',') || 'none'}`,
      `wait_wakeup_statuses=${result.waitWakeStatuses.join(',') || 'none'}`,
      `wait_wakeup_status_ok=${result.waitWakeStatusOk}`,
      `dev_null_open_error_seen=${result.devNullOpenErrorSeen}`,
      `output_seen=${result.outputSeen}`,
      `events_seen=${result.eventsSeen}`,
      `fields_present=${result.fieldsPresent}`,
      `boot=${JSON.stringify(result.boot)}`,
      `terminal_tail=${summarize(result.terminalTail)}`,
      `console_lines=${summarize(consoleLines)}`,
      '',
    ].join('\n'));

    console.log('[proof] artifact_dir=', OUTPUT_DIR);
    console.log('[proof] artifacts=', result.artifacts.join(' '));
    console.log('[proof] proof=', result.proofPath);
    console.log('[proof] event_count=', result.eventCount);
    console.log('[proof] event_kinds=', result.eventKinds.join(', ') || 'none');
    console.log('[proof] required_kinds_present=', result.requiredKindsPresent);
    console.log('[proof] wait_wakeup_statuses=', result.waitWakeStatuses.join(', ') || 'none');
    console.log('[proof] wait_wakeup_status_ok=', result.waitWakeStatusOk);
    console.log('[proof] dev_null_open_error_seen=', result.devNullOpenErrorSeen);
    console.log('[proof] output_seen=', result.outputSeen);
    console.log('[proof] events_seen=', result.eventsSeen);
    console.log('[proof] fields_present=', result.fieldsPresent);
    console.log('[proof] overlay_text=', summarize(result.overlayText));
    console.log('[proof] terminal_tail=', summarize(result.terminalTail));

    if (!result.outputSeen
      || !result.eventsSeen
      || !result.fieldsPresent
      || !result.requiredKindsPresent
      || !result.waitWakeStatusOk
      || result.devNullOpenErrorSeen) {
      process.exitCode = 1;
    }
  } finally {
    if (browser) {
      await browser.close();
    }
    if (server) {
      server.kill('SIGTERM');
    }
  }
}

main().catch((err) => {
  console.error('[proof] failed:', err);
  process.exit(1);
});
