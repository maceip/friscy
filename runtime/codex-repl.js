#!/usr/bin/env node
'use strict';

const fs = require('fs');
const https = require('https');

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

function parseResponsesText(json) {
  if (typeof json?.output_text === 'string' && json.output_text.trim()) return json.output_text;
  const out = json?.output;
  if (Array.isArray(out)) {
    const chunks = [];
    for (const item of out) {
      const content = item?.content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        if (typeof part?.text === 'string' && part.text) chunks.push(part.text);
      }
    }
    if (chunks.length) return chunks.join('\n');
  }
  return '';
}

function runCodexPrompt(prompt) {
  return new Promise((resolve) => {
    const key = process.env.OPENAI_API_KEY || '';
    if (!key || /PLACEHOLDER|YOUR_API_KEY_HERE/.test(key)) {
      resolve('Error: OPENAI_API_KEY is missing.\n');
      return;
    }

    const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
    const payload = JSON.stringify({
      model,
      input: prompt || 'write me a haiku',
      max_output_tokens: 384,
    });

    const req = https.request({
      hostname: 'api.openai.com',
      port: 443,
      path: '/v1/responses',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': 'Bearer ' + key,
        'content-length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data || '{}');
          if (json && json.error && json.error.message) {
            resolve('Error: ' + json.error.message + '\n');
            return;
          }
          const text = parseResponsesText(json);
          if (text) {
            resolve((text || '') + (text.endsWith('\n') ? '' : '\n'));
            return;
          }
        } catch (_e) {}
        resolve((data || `HTTP ${res.statusCode || 0}`) + '\n');
      });
    });

    req.on('error', (e) => {
      resolve('Error: ' + (e && e.message ? e.message : String(e)) + '\n');
    });

    req.setTimeout(120000, () => {
      req.destroy(new Error('request timeout'));
    });

    req.write(payload);
    req.end();
  });
}

async function runCommand(command) {
  const cmd = sanitizeCommand(command);

  if (cmd.includes('__CODEX_PROBE__')) return 'codex fast-path\n';
  if (cmd.includes('__CODEX_HAIKU__')) return runCodexPrompt('write me a haiku');
  if (cmd.includes('__CODEX_LIMERICK__')) return runCodexPrompt('write me a limerick');
  if (cmd === 'codex --version' || cmd === 'codex -v' || cmd === 'codex -V') return 'codex fast-path\n';
  if (cmd === 'codex --help' || cmd === 'codex -h') return 'Usage: codex e <prompt>\n';

  const prompt = extractCodexPrompt(cmd);
  if (prompt !== null) return runCodexPrompt(prompt);

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
