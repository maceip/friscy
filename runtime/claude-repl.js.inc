R"JS_SRC(#!/usr/bin/env node
'use strict';
const h = require('https');
const fs = require('fs');
const cp = require('child_process');
// Read lines from fd 0 using fs.readSync — avoids process.stdin
// which triggers libuv pipe2+dup2 and breaks emulator stdin delivery.
function readLine() {
  return new Promise(resolve => {
    let line = '';
    const buf = Buffer.alloc(1);
    while (true) {
      try {
        const n = fs.readSync(0, buf, 0, 1);
        if (n === 0) { resolve(line || null); return; }
        const ch = buf.toString('utf8', 0, 1);
        if (ch === '\n') { resolve(line); return; }
        if (ch !== '\r') line += ch;
      } catch(e) {
        resolve(line || null); return;
      }
    }
  });
}

const messages = [];
const model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';
const SYSTEM = 'You are Claude Code, an AI assistant running inside a Linux environment. '
  + 'You have access to bash, file reading, and file writing tools. '
  + 'Use them to help the user with coding tasks. '
  + 'Be concise in your responses. Show your work.';

const TOOLS = [
  { name: 'bash', description: 'Execute a bash command. Returns stdout, stderr, and exit code.',
    input_schema: { type: 'object', properties: {
      command: { type: 'string', description: 'The bash command to execute' },
      timeout: { type: 'number', description: 'Timeout in ms (default 30000)' }
    }, required: ['command'] } },
  { name: 'read_file', description: 'Read the contents of a file.',
    input_schema: { type: 'object', properties: {
      path: { type: 'string', description: 'Absolute or relative file path' }
    }, required: ['path'] } },
  { name: 'write_file', description: 'Write content to a file (creates or overwrites).',
    input_schema: { type: 'object', properties: {
      path: { type: 'string', description: 'File path' },
      content: { type: 'string', description: 'Content to write' }
    }, required: ['path', 'content'] } },
  { name: 'search_files', description: 'Search file contents using ripgrep (rg). Returns matching lines with file paths and line numbers.',
    input_schema: { type: 'object', properties: {
      pattern: { type: 'string', description: 'Regex pattern to search for' },
      path: { type: 'string', description: 'Directory or file to search in (default: current dir)' },
      glob: { type: 'string', description: 'File glob filter, e.g. "*.py" or "*.js"' }
    }, required: ['pattern'] } },
  { name: 'list_dir', description: 'List files and directories. Returns names with / suffix for directories.',
    input_schema: { type: 'object', properties: {
      path: { type: 'string', description: 'Directory path (default: current dir)' },
      recursive: { type: 'boolean', description: 'List recursively (default: false)' }
    } } },
  { name: 'edit_file', description: 'Replace exact text in a file. The old_string must match exactly (including whitespace).',
    input_schema: { type: 'object', properties: {
      path: { type: 'string', description: 'File path' },
      old_string: { type: 'string', description: 'Exact text to find and replace' },
      new_string: { type: 'string', description: 'Replacement text' }
    }, required: ['path', 'old_string', 'new_string'] } }
];

// Execute a tool call and return the result string
function execTool(name, input) {
  try {
    if (name === 'bash') {
      const timeout = input.timeout || 30000;
      try {
        const out = cp.execSync(input.command, {
          encoding: 'utf8', timeout, maxBuffer: 1024 * 1024,
          stdio: ['pipe', 'pipe', 'pipe']
        });
        return out.slice(0, 8000) || '(no output)';
      } catch(e) {
        const out = (e.stdout || '') + (e.stderr || '');
        return 'Exit code ' + (e.status || 1) + '\n' + out.slice(0, 8000);
      }
    }
    if (name === 'read_file') {
      return fs.readFileSync(input.path, 'utf8').slice(0, 16000);
    }
    if (name === 'write_file') {
      fs.writeFileSync(input.path, input.content);
      return 'Written ' + input.content.length + ' bytes to ' + input.path;
    }
    if (name === 'search_files') {
      const args = ['-n', '--max-count=50'];
      if (input.glob) args.push('--glob', input.glob);
      args.push(input.pattern, input.path || '.');
      try {
        return cp.execSync('rg ' + args.map(a => '"' + a.replace(/"/g, '\\"') + '"').join(' '), {
          encoding: 'utf8', timeout: 15000, maxBuffer: 512 * 1024
        }).slice(0, 8000) || '(no matches)';
      } catch(e) {
        if (e.status === 1) return '(no matches)';
        return 'Error: ' + (e.stderr || e.message).slice(0, 500);
      }
    }
    if (name === 'list_dir') {
      const p = input.path || '.';
      if (input.recursive) {
        try {
          return cp.execSync('find "' + p + '" -maxdepth 3 -not -path "*/node_modules/*" -not -path "*/.git/*" | head -200', {
            encoding: 'utf8', timeout: 10000
          }).slice(0, 8000);
        } catch(e) { return 'Error: ' + e.message; }
      }
      const entries = fs.readdirSync(p, { withFileTypes: true });
      return entries.map(e => e.name + (e.isDirectory() ? '/' : '')).join('\n');
    }
    if (name === 'edit_file') {
      const content = fs.readFileSync(input.path, 'utf8');
      const idx = content.indexOf(input.old_string);
      if (idx === -1) return 'Error: old_string not found in ' + input.path;
      const count = content.split(input.old_string).length - 1;
      if (count > 1) return 'Error: old_string matches ' + count + ' locations. Make it more specific.';
      const updated = content.slice(0, idx) + input.new_string + content.slice(idx + input.old_string.length);
      fs.writeFileSync(input.path, updated);
      return 'Edited ' + input.path + ' (replaced ' + input.old_string.length + ' chars with ' + input.new_string.length + ' chars)';
    }
    return 'Unknown tool: ' + name;
  } catch(e) { return 'Error: ' + e.message; }
}

// Make a streaming API call. Returns { text, toolCalls }.
// text is streamed to stdout in real-time; toolCalls is an array of {id, name, input}.
function apiCall(apiKey, msgs) {
  const body = JSON.stringify({
    model, max_tokens: 4096, stream: true,
    system: SYSTEM, tools: TOOLS, messages: msgs
  });
  return new Promise((resolve, reject) => {
    const req = h.request({
      hostname: 'api.anthropic.com', port: 443,
      path: '/v1/messages', method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      if (res.statusCode !== 200) {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => reject(new Error('API ' + res.statusCode + ': ' + d.slice(0, 200))));
        return;
      }
      let buf = '', text = '', stopReason = '';
      const toolCalls = [];
      let curToolId = '', curToolName = '', curToolJson = '';
      res.on('data', chunk => {
        buf += chunk;
        const parts = buf.split('\n\n');
        buf = parts.pop();
        for (const part of parts) {
          const dl = part.split('\n').find(l => l.startsWith('data: '));
          if (!dl) continue;
          try {
            const ev = JSON.parse(dl.slice(6));
            if (ev.type === 'content_block_start') {
              if (ev.content_block && ev.content_block.type === 'tool_use') {
                curToolId = ev.content_block.id;
                curToolName = ev.content_block.name;
                curToolJson = '';
              }
            } else if (ev.type === 'content_block_delta') {
              if (ev.delta && ev.delta.type === 'text_delta' && ev.delta.text) {
                process.stdout.write(ev.delta.text);
                text += ev.delta.text;
              } else if (ev.delta && ev.delta.type === 'input_json_delta' && ev.delta.partial_json) {
                curToolJson += ev.delta.partial_json;
              }
            } else if (ev.type === 'content_block_stop') {
              if (curToolId) {
                try {
                  toolCalls.push({ id: curToolId, name: curToolName, input: JSON.parse(curToolJson) });
                } catch(e) {
                  toolCalls.push({ id: curToolId, name: curToolName, input: { command: curToolJson } });
                }
                curToolId = '';
              }
            } else if (ev.type === 'message_delta' && ev.delta) {
              stopReason = ev.delta.stop_reason || '';
            }
          } catch(e) {}
        }
      });
      res.on('end', () => resolve({ text, toolCalls, stopReason }));
    });
    req.on('error', e => reject(e));
    req.write(body);
    req.end();
    setTimeout(() => reject(new Error('timeout')), 120000);
  });
}

async function agentLoop(apiKey, userPrompt) {
  messages.push({ role: 'user', content: userPrompt });
  for (let step = 0; step < 20; step++) {
    const result = await apiCall(apiKey, messages);
    // Build assistant content blocks
    const content = [];
    if (result.text) content.push({ type: 'text', text: result.text });
    for (const tc of result.toolCalls) {
      content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
    }
    messages.push({ role: 'assistant', content });
    // If no tool calls, we're done
    if (result.toolCalls.length === 0 || result.stopReason === 'end_turn') break;
    // Execute tools and build tool_result messages
    const toolResults = [];
    for (const tc of result.toolCalls) {
      process.stdout.write('\n\x1b[90m\u2192 ' + tc.name + ': ' +
        (tc.name === 'bash' ? tc.input.command : tc.input.path || '').slice(0, 60) + '\x1b[0m\n');
      const output = execTool(tc.name, tc.input);
      toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: output });
    }
    messages.push({ role: 'user', content: toolResults });
  }
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { process.stderr.write('[repl] Error: ANTHROPIC_API_KEY not set\n'); process.exit(1); }
  process.stdout.write('\x02READY\x02\n');
  while (true) {
    const prompt = (await readLine()).trim();
    if (!prompt || prompt === '/exit' || prompt === '/quit') break;
    process.stdout.write('\x02START\x02\n');
    try {
      await agentLoop(apiKey, prompt);
    } catch(e) {
      process.stdout.write('\n\x1b[31mError: ' + e.message + '\x1b[0m\n');
    }
    process.stdout.write('\x02END\x02\n');
  }
  // Signal host to restart emulator with /bin/sh -i for a real shell
  process.stdout.write('\x02SHELL\x02\n');
  process.exit(0);
}
main().catch(e => { process.stderr.write('[repl] Fatal: ' + e.message + '\n'); process.exit(1); });
)JS_SRC"