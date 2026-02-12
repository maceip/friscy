# Frontend & UI

## Browser Runtime (`friscy-bundle/`)

The output of `friscy-pack` is a self-contained directory that can be served
by any static HTTP server:

```
friscy-bundle/
├── index.html          # Entry point — loads friscy.js
├── manifest.json       # Bundle metadata (image name, pack date)
├── friscy.js           # Emscripten-generated JS glue (~1.2 MB)
├── friscy.wasm         # Compiled libriscv + syscall layer (~1.8 MB)
├── rootfs.tar          # Extracted container filesystem
├── network_bridge.js   # WebSocket ↔ socket bridge
└── service-worker.js   # Offline caching (optional)
```

### Terminal

The browser UI embeds an xterm.js terminal that wires to the Emscripten
runtime's stdin/stdout.  Interactive sessions (shell, Python REPL) work
via the terminal ioctl support added in workstream D.

### Networking

In-browser networking uses a WebSocket bridge (`network_bridge.js`) that
connects to a host-side Go proxy (`proxy/main.go`).  Socket syscalls in
the Wasm runtime create WebSocket connections; the proxy opens real TCP/UDP
sockets on the host.

## Native Runtime

For development and testing, friscy can be built as a native Linux binary:

```bash
cd runtime && mkdir build-native && cd build-native
cmake .. -DCMAKE_BUILD_TYPE=Release && make -j$(nproc)
./friscy --rootfs /path/to/rootfs.tar /path/to/binary
```

## Future

- **AOT mode**: `friscy-pack --aot` will pre-compile RISC-V code to Wasm via
  rv2wasm for 5-20x speedup over interpretation.
- **Wizer snapshots**: Pre-initialized Wasm modules for sub-500ms cold start.
