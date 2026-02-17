# Large Demo: Claude Code — Full UI with SWE-bench Agent

The complete Claude Code experience running inside a RISC-V emulator in the browser. Pixel-perfect Claude Code UI with welcome screen, slash commands, working animation, mode cycling — all powered by the streaming SWE-bench agent REPL from the Medium demo.

**Git checkpoint:** `a7d96fa` + current session (BigInt fix, boot log suppression, e2e test)

## What's New Over Medium

| Feature | Medium (claude-repl) | Large (Claude Code UI) |
|---------|---------------------|----------------------|
| Page | `index.html` webshell with tabs | `claude-demo.html` — dedicated Claude Code page |
| API key | Typed raw into terminal | Masked prompt with `*` characters |
| Welcome | None | Full Claude Code welcome box (logo, tips, model info) |
| Slash commands | None | Client-side `/` menu with 11 commands |
| Working animation | None | Alternating orange `✻`/`✢` symbols |
| Mode cycling | None | Shift-tab cycles: don't ask / accept edits / plan mode |
| /login | None | Mock OAuth flow with green checkmark |
| /exit | None | Terminates REPL, boots real Alpine ash shell |
| E2E test | None | 21-check Puppeteer test suite |

## Files

Everything from Medium, plus:

| File | Description |
|------|-------------|
| `claude-demo.html` | Claude Code demo page — full-screen xterm.js with Claude Code UI |
| `claude-icon.svg` | Claude tab icon |
| `claude-sparkle.svg` | Claude sparkle decoration |
| `test-claude-demo-e2e.cjs` | 21-check Puppeteer end-to-end test |

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

### 3. Open the Claude Code demo

```
http://localhost:8081/claude-demo.html?example=claude-demo&proxy=https://localhost:4433/connect
```

### 4. Interact

1. **API key prompt** — enter your Anthropic API key (input masked with `*`)
2. **Welcome screen** — Claude Code box with logo, "Opus 4.6 · Claude Max", tips panel
3. **Type a prompt** at the `❯` cursor
4. **Working animation** — orange `✻ Working…` / `✢ Working…` while waiting
5. **Streaming response** — tokens appear in real-time
6. **Tool use** — try "Create a file called test.py with a fibonacci function"
7. **Slash commands** — type `/` to see the menu
8. **Shift-tab** — cycles footer mode (don't ask / accept edits / plan mode)
9. **/exit** — drops to a real Alpine ash shell

## Claude Code UI Features (All Client-Side)

### Welcome Screen
```
╭─── Claude Code ──────────────────────────────────────────────╮
│                              │ Tips                          │
│         Welcome!             │ Run /init to create CLAUDE.md │
│        ▐▛███▜▌               │ Ask me to help with code      │
│       ▝▜█████▛▘              │                               │
│         ▘▘ ▝▝                │ Recent activity               │
│  Opus 4.6 · Claude Max      │ No recent conversations       │
│         ~/                   │                               │
╰──────────────────────────────────────────────────────────────╯
❯ Try "edit <filepath> to..."
  ⏵⏵ don't ask on (shift+tab to cycle)
```

### Slash Commands Menu
Type `/` at empty prompt to open:
- `/add-dir` — Add directory to context
- `/agents` — Show running agents
- `/chrome` — Toggle chrome
- `/clear` — Clear terminal
- `/compact` — Compact conversation
- `/config` — Show config
- `/exit` — Exit to shell
- `/help` — Show help
- `/init` — Initialize project
- `/login` — OAuth login flow
- `/model` — Select model

Arrow keys navigate, Enter selects, Escape closes.

### Shell Restart (/exit)
1. REPL sends `\x02SHELL\x02` sentinel then `process.exit(0)`
2. `claude-demo.html` detects sentinel → terminates Web Worker
3. Creates fresh Worker → boots `/bin/sh -i` (real Alpine ash)
4. Rootfs cached via `.slice(0)` — instant restart, no re-download

## Running the E2E Test

```bash
export ANTHROPIC_API_KEY=sk-ant-...
node test-claude-demo-e2e.cjs
```

Requires: `serve.js` on port 8081, proxy on port 4433, Chrome/Chromium with Puppeteer.

### 21 Checks Verified

1. No `[friscy]` debug lines in terminal
2. No `[dns]` debug lines in terminal
3. Phase reaches `apikey`
4. API key prompt visible
5. Phase reaches `prompt` (READY sentinel received)
6. Welcome screen has "Claude Code"
7. Welcome screen has "Opus"
8. Welcome screen has `❯` prompt
9. Welcome screen has tips
10. No debug lines in welcome screen
11. Slash menu phase activates
12. Slash menu shows `/add-dir`
13. Slash menu shows `/clear`
14. Slash menu shows `/exit`
15. Escape closes slash menu
16. Shift-tab cycles mode
17. Working/streaming phase after submit
18. Machine is running
19. Streaming response received
20. Response has content
21. Prompt returns after response

## Bugs Fixed for This Demo

- **BigInt crash in EM_ASM**: `-sWASM_BIGINT` passes BigInt to EM_ASM JS blocks. `new Uint8Array(buffer, BigInt, Number)` throws. Fixed with `(int)(uintptr_t)` casts in `runtime/network.hpp` + `Number()` wrapping in `friscy.js`.
- **Boot logs suppressed**: All `term.writeln('[friscy]...')` calls removed. Boot-phase emulator output silently consumed.
- **nanosleep**: `emscripten_sleep()` crashes without ASYNCIFY. Fixed to use `m.stop()` + `g_waiting_for_stdin=true` to yield to host resume loop.
