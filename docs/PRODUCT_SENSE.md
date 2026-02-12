# Product Sense

## Who is friscy for?

**Primary user:** A developer who wants to run a Linux container in the browser
without installing anything — for demos, playgrounds, education, or lightweight
cloud workloads.

**Jobs to be done:**

1. Take an existing Docker image and make it runnable in a web page with a
   single command (`friscy-pack alpine:latest`).
2. Share an interactive terminal session via a URL — no server provisioning.
3. Run CI test environments in the browser for quick feedback loops.
4. Embed a Linux runtime in documentation or tutorials for hands-on learning.

## Product Principles

1. **Docker-in, browser-out.**  The input is a standard Docker image.  The
   output is a static bundle that works in any modern browser.
2. **No server required.**  Once packed, the bundle is fully client-side.
   The optional network proxy bridges to the host but is not required.
3. **Performance matters.**  Target 40% native speed (interpreter) to 80%
   (AOT).  Users should not feel like they're in a VM.
4. **Compatible, not complete.**  Cover the syscalls that real-world
   containers actually use (84 and counting), not the full Linux ABI.

## Competitive Positioning

| Feature | WebVM | container2wasm | v86 | **friscy** |
|---------|-------|----------------|-----|------------|
| ISA | x86 (JIT) | x86 (Bochs) | x86 (JIT) | RISC-V (interp/AOT) |
| Boot time | 3-5 s | 30-60 s | 5-10 s | <500 ms |
| Kernel | Yes | Yes | Yes | No (userland) |
| Dynamic linking | Yes | Yes | Yes | Yes |
| Networking | Yes | Limited | Yes | Yes |
| Open source | No | Yes | Yes | Yes |

## Non-goals

- Full Linux kernel emulation (no device drivers, no kernel modules).
- GUI / desktop environment support.
- Windows or macOS guest OS support.
- Competing with cloud VM providers for production workloads.
