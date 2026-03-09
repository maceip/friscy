#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer';

const PROJECT_ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const BUNDLE_DIR = path.join(PROJECT_ROOT, 'friscy-bundle');
const DEFAULT_REPORT = path.join(PROJECT_ROOT, 'docs', 'generated', 'production_puppeteer_pipeline_report.json');

const PIPELINE_TOKEN_PATTERNS = [
  /Error:/i,
  /Command failed/i,
  /invalid api key/i,
  /Incorrect API key/i,
  /Please set an Auth method/i,
  /missing api key/i,
  /startup failed/i,
];

const OFFLINE_STEPS = [
  {
    name: 'shell-io',
    command: 'mkdir -p /tmp/friscy-pipeline && printf "alpha\\nbeta\\n" > /tmp/friscy-pipeline/notes.txt && grep beta /tmp/friscy-pipeline/notes.txt && echo PIPELINE_SHELL_OK',
    mustContain: 'PIPELINE_SHELL_OK',
    checkpointTag: 'shell-io',
    minCheckpointBytes: 1 * 1024 * 1024,
  },
];

const PROFILE_TARGETS = [
  {
    name: 'claude',
    example: 'claude-tui',
    envKey: 'ANTHROPIC_API_KEY',
    steps: [
      ...OFFLINE_STEPS,
      {
        name: 'git-roundtrip',
        command: 'rm -rf /tmp/friscy-git && mkdir -p /tmp/friscy-git && cd /tmp/friscy-git && git init repo >/dev/null 2>&1 && cd repo && printf "tracked\\n" > tracked.txt && git add tracked.txt && test -d .git/objects && echo PIPELINE_GIT_OK',
        mustContain: 'PIPELINE_GIT_OK',
        checkpointTag: 'git-roundtrip',
        minCheckpointBytes: 8 * 1024 * 1024,
      },
      {
        name: 'python-hash',
        command: 'python3 -c "import hashlib;print(\'PIPELINE_PY_OK=\' + hashlib.sha256(b\\\"friscy\\\").hexdigest()[:12])"',
        mustContain: 'PIPELINE_PY_OK=',
        checkpointTag: 'python-hash',
        minCheckpointBytes: 8 * 1024 * 1024,
      },
    ],
    liveStep: {
      name: 'claude-live',
      command: 'claude -p "Reply with exactly: CLAUDE_PIPELINE_OK"',
      mustContain: 'CLAUDE_PIPELINE_OK',
      checkpointTag: 'claude-live',
      minCheckpointBytes: 16 * 1024 * 1024,
    },
  },
  {
    name: 'codex',
    example: 'codex',
    envKey: 'OPENAI_API_KEY',
    steps: [
      ...OFFLINE_STEPS,
      {
        name: 'node-hash',
        command: 'node -e "const fs=require(\'fs\'); const crypto=require(\'crypto\'); fs.writeFileSync(\'/tmp/codex-pipeline.txt\', \'friscy-codex\'); const out=crypto.createHash(\'sha256\').update(fs.readFileSync(\'/tmp/codex-pipeline.txt\')).digest(\'hex\').slice(0,12); console.log(\'PIPELINE_NODE_OK=\' + out)"',
        mustContain: 'PIPELINE_NODE_OK=',
        checkpointTag: 'node-hash',
        minCheckpointBytes: 8 * 1024 * 1024,
      },
      {
        name: 'curl-smoke',
        command: 'curl --help >/dev/null 2>&1 && echo PIPELINE_CURL_OK',
        mustContain: 'PIPELINE_CURL_OK',
        checkpointTag: 'curl-smoke',
        minCheckpointBytes: 8 * 1024 * 1024,
      },
    ],
    liveStep: {
      name: 'codex-live',
      command: 'codex e "Reply with exactly: CODEX_PIPELINE_OK"',
      mustContain: 'CODEX_PIPELINE_OK',
      checkpointTag: 'codex-live',
      minCheckpointBytes: 16 * 1024 * 1024,
    },
  },
  {
    name: 'gemini',
    example: 'gemini-tui',
    envKey: 'GEMINI_API_KEY',
    steps: [
      ...OFFLINE_STEPS,
      {
        name: 'node-fs',
        command: 'node -e "const fs=require(\'fs\'); fs.mkdirSync(\'/tmp/gemini-pipeline\', { recursive:true }); fs.writeFileSync(\'/tmp/gemini-pipeline/out.txt\', \'gemini\'); console.log(\'PIPELINE_NODE_FS_OK=\' + fs.readFileSync(\'/tmp/gemini-pipeline/out.txt\', \'utf8\'))"',
        mustContain: 'PIPELINE_NODE_FS_OK=gemini',
        checkpointTag: 'node-fs',
        minCheckpointBytes: 1 * 1024 * 1024,
      },
      {
        name: 'node-crypto',
        command: 'node -e "const crypto=require(\'crypto\'); console.log(\'PIPELINE_NODE_CRYPTO_OK=\' + crypto.createHash(\'sha1\').update(\'friscy\').digest(\'hex\').slice(0,10))"',
        mustContain: 'PIPELINE_NODE_CRYPTO_OK=',
        checkpointTag: 'node-crypto',
        minCheckpointBytes: 1 * 1024 * 1024,
      },
    ],
    liveStep: {
      name: 'gemini-live',
      command: 'gemini -p "Reply with exactly: GEMINI_PIPELINE_OK"',
      mustContain: 'GEMINI_PIPELINE_OK',
      checkpointTag: 'gemini-live',
      minCheckpointBytes: 1 * 1024 * 1024,
    },
  },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const opts = {
    port: Number(process.env.FRISCY_PORT || 9010),
    baseUrl: '',
    report: DEFAULT_REPORT,
    live: false,
    noServer: false,
    targets: [],
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--port' && argv[i + 1]) opts.port = Number(argv[++i]);
    else if (arg === '--base-url' && argv[i + 1]) opts.baseUrl = String(argv[++i]);
    else if (arg === '--report' && argv[i + 1]) opts.report = path.resolve(argv[++i]);
    else if (arg === '--target' && argv[i + 1]) opts.targets.push(String(argv[++i]));
    else if (arg === '--live') opts.live = true;
    else if (arg === '--no-server') opts.noServer = true;
  }

  return opts;
}

function statInfo(absPath) {
  try {
    const st = fs.statSync(absPath);
    return { exists: true, bytes: st.size, mtimeMs: st.mtimeMs };
  } catch {
    return { exists: false, bytes: 0, mtimeMs: 0 };
  }
}

async function waitFor(fn, timeoutMs, label, intervalMs = 250) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return;
    await sleep(intervalMs);
  }
  throw new Error(`timeout waiting for ${label}`);
}

async function startServer(port) {
  const proc = spawn('node', ['serve.js', String(port)], {
    cwd: BUNDLE_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let ready = false;
  let stderr = '';
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`server start timeout on ${port}; stderr=${stderr.slice(-400)}`));
    }, 10000);

    proc.stdout.on('data', (chunk) => {
      const text = String(chunk);
      process.stdout.write(`[server] ${text}`);
      if (!ready && text.includes(`http://localhost:${port}/`)) {
        ready = true;
        clearTimeout(timer);
        resolve();
      }
    });

    proc.stderr.on('data', (chunk) => {
      stderr += String(chunk);
      process.stderr.write(`[server:err] ${chunk}`);
    });

    proc.on('exit', (code) => {
      if (!ready) {
        clearTimeout(timer);
        reject(new Error(`server exited early with code ${code}`));
      }
    });
  });

  return proc;
}

async function bootExample(page, baseUrl, example) {
  const started = Date.now();
  await page.goto(`${baseUrl}/?example=${encodeURIComponent(example)}&nosw=1&cb=${Date.now()}`, {
    waitUntil: 'networkidle2',
    timeout: 300000,
  });

  await waitFor(
    () => page.evaluate(() => Boolean(window._friscyStdinQueue && window._friscyAwaitStdinRequest && window._friscyExportLiveCheckpointUpload && window._friscyTerm)),
    300000,
    `webshell hooks (${example})`,
  );
  return Date.now() - started;
}

async function waitStdin(page, timeoutMs = 180000) {
  return Promise.race([
    page.evaluate(async (t) => {
      if (typeof window._friscyAwaitStdinRequest !== 'function') return false;
      return window._friscyAwaitStdinRequest(t);
    }, timeoutMs),
    new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs + 1000)),
  ]);
}

async function sendInput(page, payload) {
  await page.evaluate((text) => {
    const queue = window._friscyStdinQueue;
    if (!queue) throw new Error('stdin queue missing');
    const bytes = new TextEncoder().encode(text);
    for (const b of bytes) queue.push(b);
  }, payload);
}

async function readTerm(page, maxLines = 400) {
  return page.evaluate((limit) => {
    const term = window._friscyTerm;
    const buffer = term?.buffer?.active;
    if (!buffer) return '';
    const lines = [];
    for (let i = 0; i < buffer.length; i++) {
      const line = buffer.getLine(i);
      if (line) lines.push(line.translateToString(true));
    }
    return lines.slice(-limit).join('\n');
  }, maxLines);
}

async function exportCheckpoint(page, outDir, filename, minBytes) {
  const absPath = path.join(outDir, filename);
  const before = statInfo(absPath);
  const started = Date.now();
  const result = await page.evaluate(async (name) => {
    return window._friscyExportLiveCheckpointUpload(name);
  }, filename);
  await waitFor(() => {
    const info = statInfo(absPath);
    return info.exists && info.bytes >= minBytes && info.mtimeMs >= before.mtimeMs;
  }, 180000, `checkpoint upload (${filename})`);
  const after = statInfo(absPath);
  return {
    upload: result,
    before,
    after,
    ms: Date.now() - started,
  };
}

function marker(prefix, stepName) {
  return `__${prefix}_${stepName.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_${Date.now()}__`;
}

async function runStep(page, target, step, opts) {
  const begin = marker('BEGIN', step.name);
  const end = marker('END', step.name);
  const rc = marker('RC', step.name);
  const envPrefix = opts.live && target.envKey && process.env[target.envKey]
    ? `${target.envKey}='${String(process.env[target.envKey]).replace(/'/g, "'\\''")}' `
    : '';
  const command = `echo ${begin}; ${envPrefix}${step.command}; code=$?; echo ${rc}:$code; echo ${end}\n`;

  const stdinReady = await waitStdin(page);
  if (!stdinReady) throw new Error(`${target.name}/${step.name}: stdin never became ready`);

  const before = await readTerm(page);
  const started = Date.now();
  await sendInput(page, command);

  await waitFor(async () => {
    const term = await readTerm(page);
    if (term.includes(begin) && term.includes(end) && term.includes(`${rc}:`)) {
      return true;
    }

    const recentConsole = opts.consoleLines.slice(-20);
    if (recentConsole.some((line) => line.includes('resume loop: machine finished'))) {
      throw new Error(`${target.name}/${step.name}: machine finished before command markers completed`);
    }
    if (opts.pageErrors.length > 0) {
      throw new Error(`${target.name}/${step.name}: page error ${opts.pageErrors[opts.pageErrors.length - 1]}`);
    }
    return false;
  }, 420000, `${target.name}/${step.name} completion`);

  const term = await readTerm(page);
  const searchFrom = Math.max(0, before.length - 256);
  const beginIdx = term.indexOf(begin, searchFrom);
  const endIdx = beginIdx >= 0 ? term.indexOf(end, beginIdx + begin.length) : -1;
  if (beginIdx < 0 || endIdx <= beginIdx) {
    throw new Error(`${target.name}/${step.name}: marker window missing`);
  }

  const windowText = term.slice(beginIdx + begin.length, endIdx);
  const rcMatch = windowText.match(new RegExp(`${rc}:(\\d+)`));
  const exitCode = rcMatch ? Number(rcMatch[1]) : NaN;
  if (!Number.isFinite(exitCode) || exitCode !== 0) {
    throw new Error(`${target.name}/${step.name}: exit code ${String(exitCode)}`);
  }
  if (!windowText.includes(step.mustContain)) {
    throw new Error(`${target.name}/${step.name}: missing token ${step.mustContain}`);
  }
  for (const re of PIPELINE_TOKEN_PATTERNS) {
    if (re.test(windowText)) {
      throw new Error(`${target.name}/${step.name}: detected error text`);
    }
  }

  const checkpoint = await exportCheckpoint(
    page,
    opts.outDir,
    `${target.name}-${step.checkpointTag}.ckpt`,
    step.minCheckpointBytes,
  );

  return {
    ms: Date.now() - started,
    exitCode,
    checkpoint,
    tail: windowText.slice(-800),
  };
}

async function runTarget(page, baseUrl, target, opts) {
  const consoleLines = [];
  const pageErrors = [];
  const started = Date.now();

  const consoleListener = (msg) => {
    const text = msg.text();
    consoleLines.push(`[${msg.type()}] ${text}`);
    if (text.includes('[worker]') || text.includes('[friscy]') || text.includes('checkpoint')) {
      console.log(`[${target.name}] ${text}`);
    }
  };
  const pageErrorListener = (err) => {
    pageErrors.push(err.message);
    console.error(`[${target.name}] pageerror ${err.message}`);
  };

  page.on('console', consoleListener);
  page.on('pageerror', pageErrorListener);

  try {
    const bootMs = await bootExample(page, baseUrl, target.example);
    const bootCheckpoint = await exportCheckpoint(page, opts.outDir, `${target.name}-boot.ckpt`, 1 * 1024 * 1024);

    const results = [];
    for (const step of target.steps) {
      results.push({
        name: step.name,
        mode: 'offline',
        ...(await runStep(page, target, step, { ...opts, consoleLines, pageErrors })),
      });
    }

    if (opts.live && target.liveStep) {
      if (target.envKey && !process.env[target.envKey]) {
        results.push({
          name: target.liveStep.name,
          mode: 'live',
          skipped: true,
          reason: `missing ${target.envKey}`,
        });
      } else {
        results.push({
          name: target.liveStep.name,
          mode: 'live',
          ...(await runStep(page, target, target.liveStep, { ...opts, consoleLines, pageErrors })),
        });
      }
    }

    return {
      ok: true,
      target: target.name,
      example: target.example,
      bootMs,
      bootCheckpoint,
      totalMs: Date.now() - started,
      steps: results,
      pageErrors,
      consoleTail: consoleLines.slice(-40),
    };
  } catch (error) {
    return {
      ok: false,
      target: target.name,
      example: target.example,
      totalMs: Date.now() - started,
      error: error && error.stack ? error.stack : String(error),
      pageErrors,
      consoleTail: consoleLines.slice(-60),
    };
  } finally {
    page.off('console', consoleListener);
    page.off('pageerror', pageErrorListener);
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const baseUrl = opts.baseUrl || `http://127.0.0.1:${opts.port}`;
  const outDir = BUNDLE_DIR;
  const targets = opts.targets.length > 0
    ? PROFILE_TARGETS.filter((t) => opts.targets.includes(t.name))
    : PROFILE_TARGETS;

  if (targets.length === 0) {
    throw new Error('no matching targets');
  }

  fs.mkdirSync(path.dirname(opts.report), { recursive: true });

  let serverProc = null;
  if (!opts.noServer && !opts.baseUrl) {
    serverProc = await startServer(opts.port);
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    protocolTimeout: 60 * 60 * 1000,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--enable-features=WebTransport,WebAssemblyExperimentalJSPI',
      '--enable-experimental-web-platform-features',
    ],
  });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);

    const report = {
      createdAt: new Date().toISOString(),
      baseUrl,
      live: opts.live,
      targets: [],
    };

    let ok = true;
    for (const target of targets) {
      const result = await runTarget(page, baseUrl, target, { ...opts, outDir });
      report.targets.push(result);
      ok = ok && result.ok;
    }

    fs.writeFileSync(opts.report, JSON.stringify(report, null, 2));
    console.log(`[pipeline] wrote report ${opts.report}`);
    process.exit(ok ? 0 : 1);
  } finally {
    await browser.close().catch(() => {});
    if (serverProc) serverProc.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error('[pipeline] fatal:', error && error.stack ? error.stack : String(error));
  process.exit(1);
});
