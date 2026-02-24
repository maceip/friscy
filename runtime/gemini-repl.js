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
              done(parts.join('\n').trimEnd() + '\n');
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

  if (cmd.includes('__GEMINI_PROBE__')) return 'gemini-cli fast-path\n';
  if (cmd.includes('__GEMINI_HELP__')) return 'Usage: gemini [options] [command]\n';
  if (cmd.includes('__GEMINI_HAIKU__')) return runGeminiPrompt('write me a haiku');
  if (cmd.includes('__GEMINI_LIMERICK__')) return runGeminiPrompt('write me a limerick');

  if (cmd === 'gemini mcp list') return 'No MCP servers configured.\n';
  if (cmd === 'gemini --version' || cmd === 'gemini -v' || cmd === 'gemini -V') return 'gemini-cli fast-path\n';
  if (cmd === 'gemini --help' || cmd === 'gemini -h') return 'Usage: gemini [options] [command]\n';

  const prompt = extractGeminiPrompt(cmd);
  if (prompt !== null) return runGeminiPrompt(prompt);

  if (!cmd) return '';
  return `Unsupported command in gemini runner: ${cmd}\n`;
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
  process.stderr.write('[repl] Fatal: ' + (e && e.message ? e.message : String(e)) + '\n');
  process.exit(1);
});
