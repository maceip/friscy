# Security

## Threat Model

friscy runs untrusted Linux binaries inside a WebAssembly sandbox.  The
primary security boundary is the Wasm execution environment — guest code
cannot escape to the host except through explicitly implemented syscalls.

### Trust boundaries

| Boundary | Trust level |
|----------|------------|
| Wasm sandbox (browser) | Fully trusted — browser enforces memory isolation |
| libriscv interpreter | Trusted — emulates RISC-V in linear memory |
| Syscall layer (`syscalls.hpp`) | Semi-trusted — validates all guest pointers |
| VFS (`vfs.hpp`) | Semi-trusted — tar-backed, no host filesystem access |
| Network bridge (WebSocket) | Untrusted — proxies to host-side Go server |
| Host proxy (`proxy/main.go`) | Trusted on host — opens real TCP/UDP sockets |

### Sandbox Properties

- **Memory isolation:** Guest RISC-V code runs in Wasm linear memory.  It
  cannot access browser memory, DOM, or other tabs.
- **No host filesystem access:** The VFS is entirely in-memory, loaded from a
  tar archive.  There is no passthrough to the host filesystem.
- **No raw network access:** Socket syscalls are forwarded over WebSocket to
  the host proxy.  Without the proxy, networking is unavailable.

### Attack Surface

- **Syscall layer.**  A malicious guest binary could attempt to exploit
  incorrect pointer validation in syscall handlers.  All guest memory
  accesses go through libriscv's bounds-checked `machine.memory` API.
- **Network proxy.**  The Go proxy opens real sockets on the host.  A guest
  could scan the host's network or connect to internal services.  The proxy
  should be restricted to specific ports/hosts in production.
- **Tar loading.**  Malformed tar archives could trigger parsing bugs in
  `vfs.hpp`.  The tar parser should reject symlink traversals and oversized
  entries.

## Recommendations

1. Run the network proxy behind a firewall with egress filtering.
2. Validate tar archives before serving to clients.
3. Do not expose the proxy's WebSocket port to the public internet without
   authentication.
4. Consider Content-Security-Policy headers for the served bundle.
