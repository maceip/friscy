# Medium Demo: claude-repl.js — Streaming SSE Agent with Tool Use

Interactive SWE-bench-style agent running inside the RISC-V emulator in the browser. Streaming SSE responses, 6 tools (bash, read_file, write_file, search_files, list_dir, edit_file), multi-turn conversation, and an agent loop that executes tool calls inside emulated Alpine Linux.

**Git checkpoint:** `a7d96fa`

## What's New Over Small

| Feature | Small (claude-fast) | Medium (claude-repl) |
|---------|-------------------|---------------------|
| API call | Single-shot, one response | Streaming SSE, token-by-token |
| Interaction | None — prints and exits | Interactive REPL, multi-turn |
| Tool use | None | 6 tools, up to 20 steps per prompt |
| Conversation | Single message | Messages accumulate across turns |
| Protocol | stdout only | Sentinel protocol (READY/START/END/SHELL) |

## Files

Same emulator files as Small, plus the `claude-demo` manifest entry in `manifest.json` which runs `/usr/local/bin/claude-repl.js` (baked into the rootfs as a virtual file from `runtime/main.cpp`).

### Proxy

| File | Description |
|------|-------------|
| `proxy/friscy-proxy-linux` | Pre-built WebTransport proxy binary (Go, 13M) |
| `proxy/testdata/cert.pem` | Self-signed TLS cert |
| `proxy/testdata/key.pem` | TLS private key |

## How to Run

### 1. Start the WebTransport proxy

```bash
cd proxy
./friscy-proxy-linux \
  --cert testdata/cert.pem \
  --key testdata/key.pem \
  --listen :4433
```

### 2. Start the web server

```bash
node serve.js 8081
```

### 3. Open in browser

```
http://localhost:8081/index.html?example=claude-demo&proxy=https://localhost:4433/connect
```

### 4. Interact

The emulator boots Node.js and starts `claude-repl.js`. Type your API key on the first line, then prompts on subsequent lines. Responses stream back token-by-token via SSE.

Try tool-using prompts:
- `Create a file called hello.txt containing "Hello World"`
- `List the files in /etc`
- `Read /etc/os-release`
- `Run uname -a`

## SWE-bench Agent Details

### Tools

| Tool | Description |
|------|-------------|
| `bash` | Execute shell commands in emulated Alpine Linux |
| `read_file` | Read file contents with line numbers |
| `write_file` | Create or overwrite files |
| `search_files` | Grep for patterns in directory trees |
| `list_dir` | List directory contents |
| `edit_file` | Search-and-replace within files |

### Sentinel Protocol

The REPL communicates with the host page via stdout sentinels:

| Sentinel | Meaning |
|----------|---------|
| `\x02READY\x02` | Node.js booted, API key accepted, ready for prompts |
| `\x02START\x02` | API call started, streaming response follows |
| `\x02END\x02` | Response complete, ready for next prompt |
| `\x02SHELL\x02` | REPL exiting, host should boot a shell |

### Streaming SSE

```
claude-repl.js
  └─ https.request({stream: true}) → api.anthropic.com
      └─ res.on('data') fires per SSE chunk
          └─ Parse "data: {...}" lines
              └─ content_block_delta → process.stdout.write(delta.text)
                  └─ Emulator ring buffer → xterm.js (4ms poll)
```

Tokens arrive every ~50-100ms from the API. The emulator processes millions of instructions between them — no buffering bottleneck.

### Agent Loop

Each prompt triggers up to 20 tool-use rounds:
1. Send messages to Claude API with `stream: true`
2. Parse streamed response for `tool_use` content blocks
3. Execute each tool call inside the emulated Linux
4. Append tool results to messages array
5. Call API again with accumulated context
6. Repeat until Claude responds with text only (no more tool calls)

## Networking Pipeline

```
claude-repl.js (guest Node.js, RISC-V)
  └─ https.request → TLS → TCP syscalls
      └─ emulator sys_sendto → network.hpp EM_ASM
          └─ SharedArrayBuffer RPC → network_bridge.js
              └─ WebTransport datagrams → proxy (port 4433)
                  └─ TCP → api.anthropic.com:443
                      └─ SSE chunks stream back the same path
```

## Performance

| Phase | Instructions |
|-------|-------------|
| Node.js boot (V8 snapshot) | ~340M |
| First API call + streaming | ~150M |
| Tool execution (bash) | ~5-10M per tool |
| Total first prompt with tools | ~500-600M |
