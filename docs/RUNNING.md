# Running friscy — Native, Browser, and Node.js

## Native Emulator

### Basic usage

```bash
./runtime/build-native/friscy --rootfs <rootfs.tar> /path/to/binary -- arg1 arg2 ...
```

Everything before `--` is friscy options + the binary path.
Everything after `--` is passed as argv to the guest binary.

### Important: argument passing

The guest binary receives argv as: `[binary_path, arg1, arg2, ...]`
Flags like `--snapshot-blob` or `-e` go AFTER `--` so they reach Node.js as flags.

```bash
# CORRECT: Node sees --snapshot-blob as its own flag
./runtime/build-native/friscy --rootfs rootfs.tar /usr/bin/node -- --snapshot-blob /tmp/snap.blob -e "console.log(42)"

# WRONG: friscy eats everything, Node never sees the flags
./runtime/build-native/friscy --rootfs rootfs.tar /usr/bin/node --snapshot-blob /tmp/snap.blob
```

### Environment variables

```bash
# Override a single env var (replaces matching KEY= in defaults)
./runtime/build-native/friscy --rootfs rootfs.tar --env "NODE_OPTIONS=" /usr/bin/node -- -e "console.log('hi')"
```

Default env includes `NODE_OPTIONS=--jitless --no-experimental-strip-types --max-old-space-size=256 -r /etc/dns-preload.js` (set in main.cpp). Override with `--env "NODE_OPTIONS="` to clear.

### Export VFS after execution

```bash
./runtime/build-native/friscy --rootfs rootfs.tar --export-tar /tmp/output.tar /usr/bin/node -- script.js
```

The exported tar contains all files written by the guest during execution.

### MAX_INSTRUCTIONS

Default: 2 trillion. Hardcoded in main.cpp. The emulator will stop after this many instructions.

## Browser (Wasm) Emulator

### Test harness

```bash
node tests/test-claude-browser.mjs <example-name> <port>
```

This launches a headless Chrome via Puppeteer, navigates to `http://localhost:<port>?example=<example-name>`, and waits for output.

### Example configs

Examples are defined in `friscy-bundle/manifest.json`:

```json
{
  "claude-snap": {
    "rootfs": "./claude-slim-snap.tar",
    "entrypoint": ["/usr/bin/node", "--jitless", ...args],
    "env": ["ANTHROPIC_API_KEY=..."],
    "dns": ["108.61.10.10"]
  }
}
```

The `entrypoint` array maps to: `friscy --rootfs <rootfs> <entrypoint[0]> -- <entrypoint[1:]>`

### Architecture: Worker + SharedArrayBuffer

- Emscripten module runs in a Web Worker
- Three SharedArrayBuffers: control (4KB), stdout ring (64KB), net RPC (64KB)
- Main thread polls ring buffer at 4ms intervals for terminal output
- Worker calls `resume<false>(CHUNK_SIZE)` in a loop (chunked execution)
- Stdin: main thread writes to SAB, worker reads on next chunk boundary

### Resume cycles

"Resume cycles" count how many times the Worker's chunked execution loop completes one iteration. During initial guest boot, the loop runs continuously but the resume counter only increments after `main()` returns and enters the resume loop. **A test showing "0 resumes" means the guest is still in its initial boot — not necessarily stuck.**

To check if a long-running browser test is making progress:
```bash
# Check if the Chrome renderer thread is actually computing
for t in $(ls /proc/<renderer-pid>/task/); do
  state=$(cat /proc/<renderer-pid>/task/$t/stat | awk '{print $3}')
  cputime=$(cat /proc/<renderer-pid>/task/$t/stat | awk '{print $14+$15}')
  echo "tid=$t state=$state cpu_ticks=$cputime"
done
```
Look for one thread in state=R with high cpu_ticks — that's the Wasm execution thread.

## V8 Snapshots

### Building a snapshot

```bash
node --snapshot-blob /tmp/output.blob --build-snapshot entry.cjs
```

The entry script must call `v8.startupSnapshot.setDeserializeMainFunction()`.

### Loading a snapshot

```bash
node --snapshot-blob /tmp/output.blob -- -e "console.log(globalThis.answer)"
```

### Cross-platform snapshots: NOT POSSIBLE

V8 snapshots are architecture-specific. The blob header contains the arch tag (e.g., `x64`, `riscv64`). Node.js checks this on load:

```
Failed to load the startup snapshot because it was built with
architecture x64 and the architecture is riscv64.
```

Same Node version + same OS but different arch = rejected. There is no way to build a snapshot on x86 and use it on riscv64.

### Snapshot build cost in emulator

Building a snapshot of the full Claude CLI (15MB CJS) inside the RISC-V emulator requires ~2 trillion instructions. At native emulator speed (~500M instr/sec) that's ~1 hour. In Wasm (~25M instr/sec) that's ~22 hours.

The `claude-fast.js` lightweight client produces a 5.7MB snapshot in ~480M instructions (seconds natively, ~1 min in Wasm).

## Rootfs

### Creating a rootfs tar

```bash
# From Docker
docker export $(docker create --platform linux/riscv64 <image>) | tar cf rootfs.tar

# Or manually
mkdir -p rootfs/{usr/bin,lib,etc,tmp,proc,dev}
# ... add files ...
cd rootfs && tar cf ../rootfs.tar .
```

### Required contents

- `/lib/ld-musl-riscv64.so.1` — musl dynamic linker (for dynamically linked binaries)
- Shared libraries in `/usr/lib/` (for Node.js: libz, libssl, libcrypto, libicu*, etc.)
- `/etc/resolv.conf` — DNS resolver config
- The binary itself (e.g., `/usr/bin/node`)

### VFS virtual files (auto-created by emulator)

- `/dev/null`, `/dev/zero`, `/dev/urandom`
- `/dev/tty`, `/dev/console`, `/dev/pts/0`, `/dev/ptmx`
- `/proc/self/exe` (symlink to binary)

## Performance reference

| Guest workload | Instructions | Native time | Wasm time |
|---|---|---|---|
| busybox echo | ~5M | instant | instant |
| Node.js `console.log(42)` | ~203M | <1s | ~10s |
| claude-fast.js API call | ~481M | ~2.5s | ~30s |
| Claude CLI `--version` | ~3.4B | ~7s | ~3 min |
| Claude CLI `-p` (full boot) | ~2T+ | ~1 hour | ~22 hours |
