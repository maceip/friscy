#!/usr/bin/env node
'use strict';

const fs = require('fs');
const cp = require('child_process');

function readLine() {
  return new Promise((resolve) => {
    let line = '';
    const buf = Buffer.alloc(1);
    while (true) {
      try {
        const n = fs.readSync(0, buf, 0, 1);
        if (n === 0) {
          resolve(line || null);
          return;
        }
        const ch = buf.toString('utf8', 0, 1);
        if (ch === '\n') {
          resolve(line);
          return;
        }
        if (ch !== '\r') line += ch;
      } catch (_e) {
        resolve(line || null);
        return;
      }
    }
  });
}

function sanitizeCommand(command) {
  let cmd = String(command || '');
  cmd = cmd.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');
  cmd = cmd.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '');
  cmd = cmd.replace(/\x1bP[\s\S]*?\x1b\\/g, '');
  cmd = cmd.replace(/\x1b\[\?2004[hl]/g, '');
  cmd = cmd.replace(/\x1b\[\d+~?/g, '');
  cmd = cmd.replace(/\x00/g, '');
  return cmd.trim();
}

function unquote(text) {
  let out = String(text || '').trim();
  if ((out.startsWith('"') && out.endsWith('"')) || (out.startsWith("'") && out.endsWith("'"))) {
    out = out.slice(1, -1);
  }
  return out;
}

function extractCodexPrompt(command) {
  const m = command.match(/^codex\s+e\s+([\s\S]+)$/);
  if (!m) return null;
  return unquote(m[1]);
}

function ensureTrailingNewline(text) {
  const out = String(text || '');
  return out.endsWith('\n') ? out : (out + '\n');
}

function runNativeCodex(args, timeoutMs = 20 * 60 * 1000) {
  return new Promise((resolve) => {
    const child = cp.spawn('/usr/local/bin/codex', args, {
      env: { ...process.env, CI: process.env.CI || '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (text) => {
      if (settled) return;
      settled = true;
      resolve(ensureTrailingNewline(text || ''));
    };

    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch (_e) {}
      finish('Error: codex command timeout\n');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk || '');
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk || '');
    });

    child.on('error', (e) => {
      clearTimeout(timer);
      finish('Error: ' + (e?.message || String(e)) + '\n');
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) {
        finish(stdout || stderr || '');
        return;
      }
      const suffix = signal ? `, signal=${signal}` : '';
      finish(`Command failed (exit ${code ?? 'null'}${suffix})\n${stdout}${stderr}`);
    });
  });
}

function missingKey() {
  const key = process.env.OPENAI_API_KEY || '';
  return !key || /PLACEHOLDER|YOUR_API_KEY_HERE/.test(key);
}

async function runCommand(command) {
  const cmd = sanitizeCommand(command);

  if (cmd.includes('__CODEX_PROBE__')) return runNativeCodex(['--version'], 120000);
  if (cmd.includes('__CODEX_HAIKU__')) {
    if (missingKey()) return 'Error: OPENAI_API_KEY is missing.\n';
    return runNativeCodex(['e', 'write me a haiku']);
  }
  if (cmd.includes('__CODEX_LIMERICK__')) {
    if (missingKey()) return 'Error: OPENAI_API_KEY is missing.\n';
    return runNativeCodex(['e', 'write me a limerick']);
  }
  if (cmd === 'codex --version' || cmd === 'codex -v' || cmd === 'codex -V') return runNativeCodex(['--version'], 120000);
  if (cmd === 'codex --help' || cmd === 'codex -h') return runNativeCodex(['--help'], 120000);

  const prompt = extractCodexPrompt(cmd);
  if (prompt !== null) {
    if (missingKey()) return 'Error: OPENAI_API_KEY is missing.\n';
    return runNativeCodex(['e', prompt]);
  }

  if (!cmd) return '';
  return `Unsupported command in codex runner: ${cmd}\n`;
}

async function main() {
  process.stdout.write('\x02READY\x02\n');
  while (true) {
    const line = await readLine();
    if (line == null) break;
    const cmd = sanitizeCommand(line);
    if (!cmd) continue;
    if (cmd === '/exit' || cmd === '/quit' || cmd === 'exit') break;

    process.stdout.write('\x02START\x02\n');
    const output = await runCommand(cmd);
    if (output) process.stdout.write(output);
    process.stdout.write('\x02END\x02\n');
  }
  process.stdout.write('\x02SHELL\x02\n');
  process.exit(0);
}

main().catch((e) => {
  process.stderr.write('[codex-repl] Fatal: ' + (e?.message || String(e)) + '\n');
  process.exit(1);
});
