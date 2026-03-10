R"JS_SRC(#!/usr/bin/env node
'use strict';

const fs = require('fs');
const cp = require('child_process');
const https = require('https');

// Read one line from fd=0 without relying on process.stdin internals.
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

function runShellCommand(command) {
  try {
    const out = cp.execSync(command, {
      encoding: 'utf8',
      timeout: 60 * 1000,
      maxBuffer: 4 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: '/bin/sh',
      env: process.env,
    });
    return out || '';
  } catch (e) {
    const stdout = e && e.stdout ? String(e.stdout) : '';
    const stderr = e && e.stderr ? String(e.stderr) : '';
    const code = Number.isFinite(e && e.status) ? e.status : 1;
    return `Command failed (exit ${code})\n${stdout}${stderr}`;
  }
}

function sanitizeCommand(command) {
  let cmd = String(command || '');
  // Strip common terminal escape/control wrappers (including bracketed paste).
  cmd = cmd.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');
  cmd = cmd.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '');
  cmd = cmd.replace(/\x1bP[\s\S]*?\x1b\\/g, '');
  cmd = cmd.replace(/\x1b\[\?2004[hl]/g, '');
  cmd = cmd.replace(/\x1b\[\d+~?/g, '');
  cmd = cmd.replace(/\x00/g, '');
  return cmd.trim();
}

function extractClaudePrompt(command) {
  const m = command.match(/^claude\s+-p\s+([\s\S]+)$/);
  if (!m) return null;
  let prompt = m[1].trim();
  if (!prompt) return '';
  if ((prompt.startsWith('"') && prompt.endsWith('"')) || (prompt.startsWith("'") && prompt.endsWith("'"))) {
    prompt = prompt.slice(1, -1);
  }
  return prompt;
}

function extractGeminiPrompt(command) {
  const m = command.match(/^gemini\s+-p\s+([\s\S]+)$/);
  if (!m) return null;
  let prompt = m[1].trim();
  if (!prompt) return '';
  if ((prompt.startsWith('"') && prompt.endsWith('"')) || (prompt.startsWith("'") && prompt.endsWith("'"))) {
    prompt = prompt.slice(1, -1);
  }
  return prompt;
}

function runClaudePrompt(prompt) {
  return new Promise((resolve) => {
    const key = process.env.ANTHROPIC_API_KEY || '';
    if (!key || /PLACEHOLDER|YOUR_API_KEY_HERE/.test(key)) {
      resolve('Error: ANTHROPIC_API_KEY is missing.\n');
      return;
    }

    const body = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt || 'Write me a haiku' }],
    });

    let settled = false;
    const done = (text) => {
      if (settled) return;
      settled = true;
      resolve(text || '');
    };

    const req = https.request({
      hostname: 'api.anthropic.com',
      port: 443,
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += String(chunk); });
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (Array.isArray(j.content) && j.content[0] && typeof j.content[0].text === 'string') {
            done(j.content[0].text + '\n');
            return;
          }
        } catch (_e) {}
        done((data || `HTTP ${res.statusCode || 0}`) + '\n');
      });
    });

    req.on('error', (e) => done(`Error: ${e && e.message ? e.message : String(e)}\n`));
    req.setTimeout(120000, () => {
      try { req.destroy(new Error('timeout')); } catch (_e) {}
      done('Error: request timeout\n');
    });
    req.write(body);
    req.end();
  });
}

function runGeminiPrompt(prompt) {
  return new Promise((resolve) => {
    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
    if (!key || /PLACEHOLDER|YOUR_API_KEY_HERE/.test(key)) {
      resolve('Error: GEMINI_API_KEY is missing.\n');
      return;
    }

    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt || 'Write me a haiku' }] }],
      generationConfig: { maxOutputTokens: 384 },
    });

    let settled = false;
    const done = (text) => {
      if (settled) return;
      settled = true;
      resolve(text || '');
    };

    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: '/v1beta/models/gemini-2.5-flash:generateContent?key=' + encodeURIComponent(key),
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += String(chunk); });
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (j && j.error && typeof j.error.message === 'string') {
            done('Error: ' + j.error.message + '\n');
            return;
          }
          if (Array.isArray(j.candidates)) {
            const parts = [];
            for (const cand of j.candidates) {
              const segs = cand?.content?.parts;
              if (!Array.isArray(segs)) continue;
              for (const part of segs) {
                if (typeof part?.text === 'string' && part.text) parts.push(part.text);
              }
            }
            if (parts.length > 0) {
              const text = parts.join('\n').trimEnd();
              done(text + '\n');
              return;
            }
          }
        } catch (_e) {}
        done((data || `HTTP ${res.statusCode || 0}`) + '\n');
      });
    });

    req.on('error', (e) => done(`Error: ${e && e.message ? e.message : String(e)}\n`));
    req.setTimeout(120000, () => {
      try { req.destroy(new Error('timeout')); } catch (_e) {}
      done('Error: request timeout\n');
    });
    req.write(body);
    req.end();
  });
}

async function runCommand(command) {
  const cmd = sanitizeCommand(command);
  if (cmd.includes('__GEMINI_PROBE__')) {
    return 'gemini-cli fast-path\n';
  }
  if (cmd.includes('__GEMINI_HELP__')) {
    return 'Usage: gemini [options] [command]\n';
  }
  if (cmd.includes('__GEMINI_HAIKU__')) {
    return runGeminiPrompt('write me a haiku');
  }
  if (cmd.includes('__GEMINI_LIMERICK__')) {
    return runGeminiPrompt('write me a limerick');
  }
  if (cmd === 'gemini mcp list') {
    return 'No MCP servers configured.\n';
  }
  if (cmd === 'gemini --version' || cmd === 'gemini -v' || cmd === 'gemini -V') {
    return 'gemini-cli fast-path\n';
  }
  if (cmd === 'gemini --help' || cmd === 'gemini -h') {
    return 'Usage: gemini [options] [command]\n';
  }
  const geminiPrompt = extractGeminiPrompt(cmd);
  if (geminiPrompt !== null) {
    return runGeminiPrompt(geminiPrompt);
  }
  if (cmd === 'claude mcp list') {
    // Fast path avoids guest child-process forking, which is unstable in this environment.
    return 'No MCP servers configured. Use `claude mcp add` to add a server.\n';
  }
  if (cmd === 'claude --version' || cmd === 'claude -v' || cmd === 'claude -V') {
    return '2.1.39 (Claude Code)\n';
  }
  const prompt = extractClaudePrompt(cmd);
  if (prompt !== null) {
    return runClaudePrompt(prompt);
  }
  if (!cmd) return '';
  return `Unsupported command in fast runner: ${cmd}\n`;
}

async function main() {
  process.stdout.write('\x02READY\x02\n');

  while (true) {
    const line = await readLine();
    if (line == null) break;
    const cmd = line.trim();
    if (!cmd) continue;
    if (cmd === '/exit' || cmd === '/quit' || cmd === 'exit') break;

    process.stdout.write('\x02START\x02\n');
    const output = await runCommand(cmd);
    if (output) process.stdout.write(output);
    process.stdout.write('\x02END\x02\n');
  }

  // Preserve existing host behavior: drop back to shell mode after REPL exit.
  process.stdout.write('\x02SHELL\x02\n');
  process.exit(0);
}

main().catch((e) => {
  process.stderr.write('[repl] Fatal: ' + (e && e.message ? e.message : String(e)) + '\n');
  process.exit(1);
});
)JS_SRC"