// claude-repl-llrt.js — LLRT-compatible Claude REPL
// Uses fetch() instead of https, async spawn instead of execSync
// Reads stdin via 'head -n 1' subprocess (LLRT has no process.stdin)
'use strict';
const fs = require('fs');
const { spawn } = require('child_process');

// Override globalThis.fetch with host fetch hypercall.
// __host_fetch is a native Rust function exposed by patched LLRT that
// does ecall with a7=500 (syscall 500) — the emulator stops, the Worker
// performs the real fetch(), writes the response, and resumes the machine.
if (typeof globalThis.__host_fetch === 'function') {
    globalThis.fetch = async function(url, options) {
        const reqPayload = JSON.stringify({
            url: typeof url === 'string' ? url : url.toString(),
            ...(options || {})
        });
        const rawResponse = globalThis.__host_fetch(reqPayload);
        const data = JSON.parse(rawResponse);
        return new Response(data.body, {
            status: data.status,
            statusText: data.statusText || '',
            headers: new Headers(data.headers || {}),
        });
    };
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
  { name: 'search_files', description: 'Search file contents using grep. Returns matching lines with file paths and line numbers.',
    input_schema: { type: 'object', properties: {
      pattern: { type: 'string', description: 'Regex pattern to search for' },
      path: { type: 'string', description: 'Directory or file to search in (default: current dir)' },
      glob: { type: 'string', description: 'File glob filter, e.g. "*.py" or "*.js"' }
    }, required: ['pattern'] } },
  { name: 'list_dir', description: 'List files and directories. Returns names with / suffix for directories.',
    input_schema: { type: 'object', properties: {
      path: { type: 'string', description: 'Directory path (default: current dir)' }
    } } },
  { name: 'edit_file', description: 'Replace exact text in a file. The old_string must match exactly (including whitespace).',
    input_schema: { type: 'object', properties: {
      path: { type: 'string', description: 'File path' },
      old_string: { type: 'string', description: 'Exact text to find and replace' },
      new_string: { type: 'string', description: 'Replacement text' }
    }, required: ['path', 'old_string', 'new_string'] } }
];

// Read one line from stdin using sh built-in read
function readLine() {
  return new Promise((resolve) => {
    const child = spawn('sh', ['-c', 'read line && echo "$line"'], {
      stdio: ['inherit', 'pipe', 'pipe']
    });
    let data = '';
    child.stdout.on('data', (chunk) => { data += chunk; });
    child.on('close', (code) => {
      resolve(code === 0 ? data.replace(/\n$/, '') : null);
    });
  });
}

// Execute a shell command asynchronously
function execCommand(cmd, timeout) {
  return new Promise((resolve) => {
    const child = spawn('sh', ['-c', cmd], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    const timer = setTimeout(() => {
      child.kill();
      resolve({ stdout: stdout.slice(0, 8000), stderr: stderr.slice(0, 8000), code: 124 });
    }, timeout || 30000);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout: stdout.slice(0, 8000), stderr: stderr.slice(0, 8000), code: code || 0 });
    });
  });
}

// Execute a tool call
async function execTool(name, input) {
  try {
    if (name === 'bash') {
      const r = await execCommand(input.command, input.timeout);
      if (r.code === 0) return r.stdout || '(no output)';
      return 'Exit code ' + r.code + '\n' + r.stdout + r.stderr;
    }
    if (name === 'read_file') {
      return fs.readFileSync(input.path, 'utf8').slice(0, 16000);
    }
    if (name === 'write_file') {
      fs.writeFileSync(input.path, input.content);
      return 'Written ' + input.content.length + ' bytes to ' + input.path;
    }
    if (name === 'search_files') {
      const dir = input.path || '.';
      const cmd = input.glob
        ? 'grep -rn --include="' + input.glob + '" -m 50 "' + input.pattern.replace(/"/g, '\\"') + '" ' + dir
        : 'grep -rn -m 50 "' + input.pattern.replace(/"/g, '\\"') + '" ' + dir;
      const r = await execCommand(cmd, 15000);
      return r.stdout.slice(0, 8000) || '(no matches)';
    }
    if (name === 'list_dir') {
      const p = input.path || '.';
      const entries = fs.readdirSync(p, { withFileTypes: true });
      return entries.map((e) => e.name + (e.isDirectory() ? '/' : '')).join('\n');
    }
    if (name === 'edit_file') {
      const content = fs.readFileSync(input.path, 'utf8');
      const idx = content.indexOf(input.old_string);
      if (idx === -1) return 'Error: old_string not found in ' + input.path;
      const count = content.split(input.old_string).length - 1;
      if (count > 1) return 'Error: old_string matches ' + count + ' locations. Make it more specific.';
      const updated = content.slice(0, idx) + input.new_string + content.slice(idx + input.old_string.length);
      fs.writeFileSync(input.path, updated);
      return 'Edited ' + input.path;
    }
    return 'Unknown tool: ' + name;
  } catch(e) { return 'Error: ' + (e.message || e); }
}

// Make a non-streaming API call using fetch(). Returns { text, toolCalls, stopReason }.
async function apiCall(apiKey, msgs) {
  const body = JSON.stringify({
    model, max_tokens: 4096,
    system: SYSTEM, tools: TOOLS, messages: msgs
  });
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error('API ' + res.status + ': ' + errText.slice(0, 200));
  }
  const data = await res.json();
  let text = '';
  const toolCalls = [];
  for (const block of data.content) {
    if (block.type === 'text') text += block.text;
    if (block.type === 'tool_use') toolCalls.push({ id: block.id, name: block.name, input: block.input });
  }
  return { text, toolCalls, stopReason: data.stop_reason };
}

async function agentLoop(apiKey, userPrompt) {
  messages.push({ role: 'user', content: userPrompt });
  for (let step = 0; step < 20; step++) {
    const result = await apiCall(apiKey, messages);
    // Build assistant content blocks
    const content = [];
    if (result.text) {
      content.push({ type: 'text', text: result.text });
      console.log(result.text);
    }
    for (const tc of result.toolCalls) {
      content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
    }
    messages.push({ role: 'assistant', content });
    if (result.toolCalls.length === 0 || result.stopReason === 'end_turn') break;
    // Execute tools
    const toolResults = [];
    for (const tc of result.toolCalls) {
      const label = tc.name === 'bash' ? tc.input.command : (tc.input.path || '');
      console.log('\x1b[90m\u2192 ' + tc.name + ': ' + label.slice(0, 60) + '\x1b[0m');
      const output = await execTool(tc.name, tc.input);
      toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: output });
    }
    messages.push({ role: 'user', content: toolResults });
  }
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { console.error('[repl] Error: ANTHROPIC_API_KEY not set'); process.exit(1); }
  console.log('\x02READY\x02');
  while (true) {
    const prompt = await readLine();
    if (!prompt || prompt === '/exit' || prompt === '/quit') break;
    console.log('\x02START\x02');
    try {
      await agentLoop(apiKey, prompt);
    } catch(e) {
      console.log('\x1b[31mError: ' + (e.message || e) + '\x1b[0m');
    }
    console.log('\x02END\x02');
  }
  console.log('\x02SHELL\x02');
  process.exit(0);
}
main().catch((e) => { console.error('[repl] Fatal: ' + (e.message || e)); process.exit(1); });
