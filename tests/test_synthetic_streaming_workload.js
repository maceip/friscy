#!/usr/bin/env node
// Synthetic Claude-like workload:
// - parse/eval large JS payload inside guest Node
// - call a mock streaming API over network proxy
// - verify streamed completion marker is emitted

import puppeteer from 'puppeteer';
import { createServer } from 'net';
import { spawn, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, readFileSync, mkdirSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { X509Certificate, createHash } from 'crypto';
import { startMockStreamService } from './mock/mock_stream_service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');
const BUNDLE_DIR = join(PROJECT_ROOT, 'friscy-bundle');
const PROXY_DIR = join(PROJECT_ROOT, 'proxy');

const REQUESTED_PORT = Number.parseInt(process.env.FRISCY_TEST_PORT || '8099', 10);
const ROOTFS_URL = process.env.FRISCY_TEST_ROOTFS_URL || './nodejs-claude.tar';
const WAIT_FOR_EXIT = process.env.FRISCY_TEST_WAIT_FOR_EXIT !== '0';
const METRIC_WAIT_TIMEOUT_MS = Number.parseInt(process.env.FRISCY_TEST_METRIC_WAIT_TIMEOUT_MS || '180000', 10);
const SYNTH_BUNDLE_MB = Number.parseInt(process.env.FRISCY_TEST_SYNTH_BUNDLE_MB || '6', 10);

const GUEST_WORKLOAD_SOURCE_TEMPLATE = String.raw`
const vm = require('vm');

function buildSyntheticBundle(targetMB) {
  const targetBytes = Math.max(1, targetMB) * 1024 * 1024;
  const parts = [];
  let bytes = 0;
  let i = 0;
  while (bytes < targetBytes) {
    const line = "const m" + i + "=(((" + i + "*1103515245+12345)>>>0)^" + (i % 97) + ");";
    parts.push(line);
    bytes += line.length;
    i++;
  }
  parts.push("globalThis.__syntheticCount=" + i + ";");
  return parts.join("");
}

function parseSSEText(sseText) {
  let output = "";
  let frameCount = 0;
  let sawDone = false;
  for (const line of sseText.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    try {
      const payload = JSON.parse(line.slice(5).trim());
      if (payload.delta) {
        frameCount += 1;
        output += payload.delta;
      }
      if (payload.done) sawDone = true;
    } catch {}
  }
  return { output, frameCount, sawDone };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  const t0 = Date.now();
  const mb = __SYNTH_BUNDLE_MB__;
  const source = buildSyntheticBundle(mb);
  const script = new vm.Script(source, { filename: "synthetic_bundle.min.js" });
  const context = vm.createContext({ globalThis: {} });
  script.runInContext(context);
  const parseEvalMs = Date.now() - t0;
  console.log("[synthetic] bundle_bytes=" + source.length);
  console.log("[synthetic] parse_eval_ms=" + parseEvalMs);

  const streamUrl = __MOCK_STREAM_URL__;
  const apiKey = __MOCK_API_KEY__;
  if (typeof fetch !== "function") {
    throw new Error("global fetch unavailable in guest Node runtime");
  }

  let sseText = "";
  const maxAttempts = 4;
  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(streamUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({ prompt: "stream me synthetic response" }),
      });
      if (!res.ok) {
        throw new Error("stream status " + res.status);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      sseText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        sseText += chunk;
        process.stdout.write(chunk);
      }
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      console.error("[synthetic] stream attempt " + attempt + " failed:", err && err.message ? err.message : String(err));
      if (attempt < maxAttempts) {
        await wait(1200);
      }
    }
  }
  if (lastErr) throw lastErr;

  const parsed = parseSSEText(sseText);
  const output = parsed.output;
  const frameCount = parsed.frameCount;

  console.log("");
  console.log("[synthetic] stream_frames=" + frameCount);
  const ok = parsed.sawDone && output.includes("mock-stream-complete");
  if (!ok) {
    console.error("[synthetic] missing completion signature");
    process.exit(3);
  }
  console.log("SYNTHETIC_STREAM_OK");
}

run().catch((err) => {
  console.error("[synthetic] fatal", err && err.stack ? err.stack : String(err));
  process.exit(1);
});
`;

async function canBindPort(port) {
    return new Promise((resolve) => {
        const probe = createServer();
        probe.unref();
        probe.once('error', () => resolve(false));
        probe.once('listening', () => probe.close(() => resolve(true)));
        probe.listen(port, '127.0.0.1');
    });
}

async function pickOpenPort(preferredPort) {
    if (Number.isInteger(preferredPort) && preferredPort > 0 && await canBindPort(preferredPort)) {
        return preferredPort;
    }
    return new Promise((resolve, reject) => {
        const probe = createServer();
        probe.unref();
        probe.once('error', reject);
        probe.listen(0, '127.0.0.1', () => {
            const addr = probe.address();
            const port = (typeof addr === 'object' && addr) ? addr.port : 8099;
            probe.close((err) => {
                if (err) reject(err);
                else resolve(port);
            });
        });
    });
}

function waitForReady(child, matcher, timeoutMs, label) {
    return new Promise((resolve, reject) => {
        const deadline = setTimeout(() => {
            reject(new Error(`${label} startup timeout`));
        }, timeoutMs);

        const onLine = (data) => {
            const text = data.toString();
            if (matcher(text)) {
                clearTimeout(deadline);
                child.stdout?.off('data', onLine);
                child.stderr?.off('data', onLine);
                resolve();
            }
        };
        child.stdout?.on('data', onLine);
        child.stderr?.on('data', onLine);
        child.on('error', (err) => {
            clearTimeout(deadline);
            reject(err);
        });
        child.on('exit', (code) => {
            clearTimeout(deadline);
            reject(new Error(`${label} exited early (${code})`));
        });
    });
}

function ensureProxyCert(certDir) {
    mkdirSync(certDir, { recursive: true });
    const certPath = join(certDir, 'cert.pem');
    const keyPath = join(certDir, 'key.pem');
    const openssl = spawnSync('openssl', [
        'req',
        '-x509',
        '-newkey',
        'ec',
        '-pkeyopt',
        'ec_paramgen_curve:prime256v1',
        '-keyout',
        keyPath,
        '-out',
        certPath,
        '-days',
        '2',
        '-nodes',
        '-subj',
        '/CN=localhost',
    ], { stdio: 'pipe' });
    if (openssl.status !== 0) {
        throw new Error(`openssl cert generation failed: ${openssl.stderr.toString('utf8')}`);
    }

    const certPem = readFileSync(certPath, 'utf8');
    const cert = new X509Certificate(certPem);
    const certHash = createHash('sha256').update(cert.raw).digest('base64');
    return { certPath, keyPath, certHash };
}

async function main() {
    let bundleServer = null;
    let proxyServer = null;
    let mockService = null;
    let browser = null;
    let originalManifest = null;
    let jitCompilerLoaded = false;
    let jitRegionsCompiled = 0;
    let instructionCount = null;
    let guestExitCode = null;
    let finalJitStats = null;
    let foundAtMs = null;
    let completionMs = null;

    try {
        const bundlePort = await pickOpenPort(REQUESTED_PORT);
        const proxyPort = await pickOpenPort(0);
        const certDir = mkdtempSync(join(tmpdir(), 'friscy-proxy-cert-'));
        const { certPath, keyPath, certHash } = ensureProxyCert(certDir);
        const proxyUrl = `https://127.0.0.1:${proxyPort}/connect`;
        const pageQuery = process.env.FRISCY_TEST_QUERY ||
            `?proxy=${encodeURIComponent(proxyUrl)}&proxycert=${encodeURIComponent(certHash)}`;

        mockService = await startMockStreamService({
            port: await pickOpenPort(4567),
            apiKey: process.env.FRISCY_TEST_MOCK_API_KEY || 'mock-stream-key',
            chunkDelayMs: Number.parseInt(process.env.FRISCY_TEST_STREAM_CHUNK_DELAY_MS || '70', 10),
        });

        const manifestPath = join(BUNDLE_DIR, 'manifest.json');
        originalManifest = readFileSync(manifestPath, 'utf8');
        const workloadSource = GUEST_WORKLOAD_SOURCE_TEMPLATE
            .replace('__SYNTH_BUNDLE_MB__', JSON.stringify(Math.max(1, SYNTH_BUNDLE_MB)))
            .replace('__MOCK_STREAM_URL__', JSON.stringify(mockService.streamUrl))
            .replace('__MOCK_API_KEY__', JSON.stringify(mockService.apiKey));

        writeFileSync(manifestPath, JSON.stringify({
            version: 1,
            image: 'synthetic-claude-like-streaming',
            rootfs: ROOTFS_URL,
            entrypoint: ['/usr/bin/node', '-e', workloadSource],
            workdir: '/',
            env: [
                'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
                'HOME=/root',
                'TERM=xterm-256color',
                'NO_COLOR=1',
            ],
            aot: [],
        }, null, 2));

        proxyServer = spawn('go', [
            'run', '-mod=mod', '.',
            '-listen', `:${proxyPort}`,
            '-api-listen', '',
            '-cert', certPath,
            '-key', keyPath,
            '-allow-private-destinations',
            '-max-sessions', '20',
            '-max-conns', '5000',
        ], {
            cwd: PROXY_DIR,
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        proxyServer.stdout.on('data', (d) => console.log(`[proxy] ${d.toString().trim()}`));
        proxyServer.stderr.on('data', (d) => console.log(`[proxy-err] ${d.toString().trim()}`));
        await waitForReady(proxyServer, (text) => text.includes('WebTransport ready for bidirectional networking'), 120000, 'proxy');

        bundleServer = spawn('node', [join(BUNDLE_DIR, 'serve.js'), String(bundlePort)], {
            stdio: ['ignore', 'pipe', 'pipe'],
            cwd: BUNDLE_DIR,
        });
        await waitForReady(bundleServer, (text) => text.includes('http://'), 10000, 'bundle server');
        bundleServer.stderr.on('data', (d) => console.log('[bundle-err]', d.toString().trim()));

        console.log(`[test] Bundle server :${bundlePort}`);
        console.log(`[test] Proxy: ${proxyUrl}`);
        console.log(`[test] Mock stream URL: ${mockService.streamUrl}`);
        console.log(`[test] Query: ${pageQuery}`);

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
        page.on('console', (msg) => {
            const text = msg.text();
            if (text.includes('[JIT] Compiler loaded')) jitCompilerLoaded = true;
            if (text.includes('[JIT] Compiled region')) jitRegionsCompiled += 1;
            const instMatch = text.match(/Instructions:\s*([0-9]+)/);
            if (instMatch) instructionCount = Number.parseInt(instMatch[1], 10);
            const guestExitMatch = text.match(/Exit code:\s*([0-9]+)/);
            if (guestExitMatch) guestExitCode = Number.parseInt(guestExitMatch[1], 10);
            console.log(`[chrome] [${msg.type()}] ${text}`);
        });
        page.on('pageerror', (err) => console.log(`[chrome-error] ${err.message}`));

        await page.goto(`http://127.0.0.1:${bundlePort}${pageQuery}`, {
            waitUntil: 'domcontentloaded',
            timeout: 45000,
        });
        console.log('[test] Page loaded');

        const start = Date.now();
        let sawSyntheticMarker = false;
        let lastLog = 0;
        while (Date.now() - start < 600000) {
            let status = '';
            let content = '';
            try {
                status = await page.evaluate(() => {
                    const el = document.getElementById('status');
                    return el ? el.textContent : '';
                });
                content = await page.evaluate(() => {
                    const el = document.querySelector('.xterm-rows');
                    return el ? el.textContent : '';
                });
            } catch (err) {
                const message = err && err.message ? err.message : String(err);
                if (message.includes('Execution context was destroyed') ||
                    message.includes('Cannot find context with specified id')) {
                    await new Promise((resolve) => setTimeout(resolve, 250));
                    continue;
                }
                throw err;
            }

            if (!sawSyntheticMarker && content.includes('SYNTHETIC_STREAM_OK')) {
                sawSyntheticMarker = true;
                foundAtMs = Date.now();
                if (!WAIT_FOR_EXIT) break;
                console.log('[test] Synthetic marker observed; waiting for exit/metrics...');
            }

            if (sawSyntheticMarker && WAIT_FOR_EXIT) {
                const metricWaitElapsed = Date.now() - (foundAtMs || start);
                if (status.includes('Exited') || status.includes('Error')) break;
                if (guestExitCode !== null && instructionCount !== null && metricWaitElapsed >= 1000) break;
                if (metricWaitElapsed >= METRIC_WAIT_TIMEOUT_MS) {
                    console.log('[test] Metric wait timeout reached');
                    break;
                }
            } else if (status.includes('Exited') || status.includes('Error')) {
                break;
            }

            const elapsed = Math.floor((Date.now() - start) / 1000);
            if (elapsed - lastLog >= 20) {
                lastLog = elapsed;
                console.log(`[test] ${elapsed}s waiting... status="${status}"`);
            }
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        const termData = await page.evaluate(() => {
            const term = document.querySelector('.xterm-rows');
            return term ? term.textContent : '';
        });
        try {
            finalJitStats = await page.evaluate(() => window.__friscyJitStats || null);
        } catch {
            finalJitStats = null;
        }
        completionMs = Date.now();

        const foundSynthetic = termData.includes('SYNTHETIC_STREAM_OK');
        const foundStreamSignature = termData.includes('mock-stream-complete');
        const hasRuntimeError =
            termData.includes('MODULE_NOT_FOUND') ||
            termData.includes('Cannot find module') ||
            termData.includes('[worker] Error:');
        const pass =
            foundSynthetic &&
            foundStreamSignature &&
            !hasRuntimeError &&
            guestExitCode === 0;

        console.log('\n=== TERMINAL CONTENT (head) ===');
        console.log(termData.slice(0, 1800));
        console.log(`=== END (${termData.length} chars) ===\n`);

        const startMs = foundAtMs ? foundAtMs - start : -1;
        const completionMsDelta = completionMs ? completionMs - start : -1;
        console.log(`[METRIC] synthetic_stream_ok=${foundSynthetic ? 1 : 0}`);
        console.log(`[METRIC] stream_signature_seen=${foundStreamSignature ? 1 : 0}`);
        console.log(`[METRIC] guest_exit_code=${guestExitCode ?? -1}`);
        console.log(`[METRIC] instructions=${instructionCount ?? -1}`);
        console.log(`[METRIC] jit_compiler_loaded=${jitCompilerLoaded ? 1 : 0}`);
        console.log(`[METRIC] jit_regions_compiled=${jitRegionsCompiled}`);
        console.log(`[METRIC] first_output_s=${(startMs / 1000).toFixed(3)}`);
        console.log(`[METRIC] completion_s=${(completionMsDelta / 1000).toFixed(3)}`);
        console.log(`[METRIC] miss_rate=${Number.isFinite(finalJitStats?.missRate) ? finalJitStats.missRate.toFixed(6) : '-1'}`);
        console.log(`[METRIC] predictor_hit_rate=${Number.isFinite(finalJitStats?.predictorHitRate) ? finalJitStats.predictorHitRate.toFixed(6) : '-1'}`);
        console.log(`[METRIC] queue_peak=${finalJitStats?.compileQueuePeak ?? -1}`);
        console.log(`[METRIC] queue_depth_end=${finalJitStats?.queueDepth ?? -1}`);

        if (!pass) {
            if (!foundSynthetic) console.log('[FAIL] missing SYNTHETIC_STREAM_OK marker');
            if (!foundStreamSignature) console.log('[FAIL] missing mock-stream-complete signature');
            if (guestExitCode !== 0) console.log(`[FAIL] guest exit code is not 0: ${guestExitCode}`);
            if (hasRuntimeError) console.log('[FAIL] runtime/module error detected in terminal output');
        }
        return pass ? 0 : 1;
    } finally {
        if (originalManifest) {
            try { writeFileSync(join(BUNDLE_DIR, 'manifest.json'), originalManifest); } catch {}
        }
        if (browser) {
            try { await browser.close(); } catch {}
        }
        if (bundleServer) bundleServer.kill('SIGTERM');
        if (proxyServer) {
            try {
                process.kill(-proxyServer.pid, 'SIGTERM');
            } catch {
                proxyServer.kill('SIGTERM');
            }
        }
        if (mockService) {
            try { await mockService.close(); } catch {}
        }
    }
}

main()
    .then((code) => process.exit(code))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
