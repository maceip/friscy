# friscy: Docker → Browser Runtime Roadmap

## Vision

**Goal**: Input any Docker image, output a high-performance browser-based runtime that beats WebVM/CheerpX.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           User Workflow                                      │
│                                                                              │
│   $ docker build -t myapp .                                                  │
│   $ friscy-pack myapp:latest --output myapp.wasm                            │
│   $ # Deploy myapp.wasm + myapp-rootfs.tar to CDN                           │
│   $ # User visits website → instant container execution in browser          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Project Status Overview

| Component | Status | Performance | Location |
|-----------|--------|-------------|----------|
| libriscv Interpreter | ✅ Complete | ~40% native | `vendor/libriscv/` |
| Syscall Emulation | ✅ ~50 syscalls | N/A | `syscalls.hpp` |
| Virtual Filesystem | ✅ Complete | N/A | `vfs.hpp` |
| Dynamic Linker | ✅ Complete | N/A | `elf_loader.hpp`, `main.cpp` |
| Networking | ✅ Complete | N/A | `network.hpp`, `proxy/` |
| friscy-pack CLI | ✅ Complete | N/A | `friscy-pack` |
| **rv2wasm AOT** | 🟡 70% Done | 5-20x speedup | `aot/src/` |
| Wizer Snapshots | ⬜ Not Started | 2-5x startup | N/A |
| Browser Terminal | 🟡 Partial | N/A | `network_bridge.js` |

**Legend**: ✅ Complete | 🟡 In Progress | ⬜ Not Started

---

## What Works Today

### Running RISC-V Binaries (Native)

```bash
# Build the interpreter
cd friscy
mkdir build-native && cd build-native
cmake .. -DCMAKE_BUILD_TYPE=Release
make -j$(nproc)

# Run a static binary
riscv64-linux-gnu-gcc -static -o hello hello.c
./friscy hello

# Run with container rootfs
./friscy --rootfs alpine-rootfs.tar /bin/busybox ls -la
```

### Building for WebAssembly

```bash
# Requires Docker with Emscripten image
./harness.sh
# Output: build/friscy.wasm, build/friscy.js
```

### Testing Networking

```bash
# Terminal 1: Start test server
python3 tests/test_server.py 8080

# Terminal 2: Run network test
./friscy tests/test_http_minimal
```

---

## Priority 1: Complete rv2wasm AOT Compiler

**Impact**: 5-20x performance improvement

The rv2wasm compiler translates RISC-V binaries to native WebAssembly at build time, eliminating interpretation overhead.

### Current Status

| Component | Status | File | Notes |
|-----------|--------|------|-------|
| CLI Interface | ✅ Done | `aot/src/main.rs` | Parses args, orchestrates pipeline |
| ELF Parsing | ✅ Done | `aot/src/elf.rs` | Uses `goblin` crate |
| Disassembler | ✅ Done | `aot/src/disasm.rs` | 80+ RV64GC opcodes |
| CFG Builder | ✅ Done | `aot/src/cfg.rs` | Basic blocks, functions |
| Wasm IR | ✅ Done | `aot/src/translate.rs` | Core integer ops |
| Wasm Output | ✅ Done | `aot/src/wasm_builder.rs` | Uses `wasm-encoder` |
| Dispatch Loop | 🟡 Basic | `aot/src/wasm_builder.rs:90` | Needs br_table |
| Float Ops | ⬜ Stubs | `aot/src/disasm.rs:90` | FLW/FSW/FADD etc |
| Atomics | ⬜ Stubs | `aot/src/disasm.rs:120` | LR/SC/AMO* |
| Integration | ⬜ Not started | `friscy-pack` | --aot flag |

### TODO: Dispatch Loop Optimization

**Where**: `aot/src/wasm_builder.rs` line 90-150

**Problem**: Current dispatch uses linear function calls. Need `br_table` for O(1) dispatch.

**How to fix**:
```rust
// In build_dispatch_function(), replace linear calls with:
// 1. Build table of (pc_address, function_index) pairs
// 2. Normalize PC to table index: (pc - base_addr) / 4
// 3. Use br_table to jump to correct block

func.instruction(&Instruction::LocalGet(2)); // $pc
func.instruction(&Instruction::I32Const(base_addr));
func.instruction(&Instruction::I32Sub);
func.instruction(&Instruction::I32Const(4));
func.instruction(&Instruction::I32DivU);
func.instruction(&Instruction::BrTable(block_targets, default_target));
```

### TODO: Floating-Point Translation

**Where**: `aot/src/translate.rs`

**Problem**: F/D extension instructions are defined in disasm.rs but not translated.

**How to fix**:
```rust
// Add cases to translate_instruction() for:
Opcode::FADD_S => {
    // Wasm has f32.add, maps directly
    body.push(WasmInst::F32Load { offset: rs1_offset });
    body.push(WasmInst::F32Load { offset: rs2_offset });
    body.push(WasmInst::F32Add);
    body.push(WasmInst::F32Store { offset: rd_offset });
}
// FP registers could share space with integer regs or use separate offsets
```

### TODO: Atomics Translation

**Where**: `aot/src/translate.rs`

**Problem**: LR/SC (load-reserved/store-conditional) need Wasm atomics or fallback.

**How to fix**:
```rust
// Option 1: Use Wasm atomics (requires SharedArrayBuffer)
Opcode::LR_D => {
    // atomic.load + reservation tracking
}
Opcode::SC_D => {
    // Compare reservation, atomic.cmpxchg
}

// Option 2: Single-threaded fallback (simpler)
Opcode::LR_D => {
    // Just load, set reservation flag
    body.push(WasmInst::I64Load { ... });
    // Store reservation address in global
}
```

### TODO: friscy-pack Integration

**Where**: `friscy-pack` (shell script, line ~150)

**How to fix**:
```bash
# In friscy-pack, after extracting rootfs:
if [ "$AOT" = "true" ]; then
    # Find all ELF binaries in rootfs
    find "$ROOTFS" -type f -executable | while read elf; do
        if file "$elf" | grep -q "RISC-V"; then
            rv2wasm "$elf" -o "${elf}.wasm"
        fi
    done
    # Generate Wasm module that links all blocks
fi
```

### Building rv2wasm

```bash
cd aot
cargo build --release
./target/release/rv2wasm input.elf -o output.wasm --verbose
```

---

## Priority 2: Test Dynamic Linking with Real Containers

**Impact**: Validates the whole stack works

### Current Status
- ✅ ELF PT_INTERP detection
- ✅ Interpreter loading at 0x40000000
- ✅ Auxiliary vector setup
- ⬜ Real container testing

### TODO: Alpine busybox Test

**Where**: `main.cpp`, command line

**How to test**:
```bash
# 1. Get Alpine RISC-V rootfs
docker create --platform linux/riscv64 alpine:latest
docker export <container_id> > alpine.tar

# 2. Run busybox
./friscy --rootfs alpine.tar /bin/busybox ls -la

# 3. If it fails, check:
#    - Are all required .so files in the tar?
#    - Is ld-musl-riscv64.so.1 present?
#    - Debug with: ./friscy --rootfs alpine.tar /bin/busybox 2>&1 | head -50
```

### TODO: Python Test

**How to test**:
```bash
# Python is a good stress test - lots of dynamic loading
./friscy --rootfs python-riscv64.tar /usr/bin/python3 -c "print('hello')"

# Common issues:
# - Missing libpython3.so
# - Missing standard library modules
# - Syscall not implemented (check stderr)
```

### Debugging Dynamic Linking

Add verbose output to `main.cpp`:
```cpp
// Around line 220
std::cout << "[friscy] Loading segment at 0x" << std::hex << vaddr << std::dec << "\n";
std::cout << "[friscy] Interpreter entry: 0x" << std::hex << interp_entry << std::dec << "\n";
```

---

## Priority 3: Wizer Snapshots

**Impact**: 2-5x faster startup

### Current Status
- ⬜ Not started

### What Needs to Be Done

**Where**: `main.cpp`, `CMakeLists.txt`

**Step 1**: Add wizer_init export
```cpp
// main.cpp - add before main()
#ifdef FRISCY_WIZER
extern "C" void wizer_init() {
    // Parse rootfs.tar (embedded or from stdin)
    // Build VFS tree
    // Load ELF headers
    // Initialize machine state
    // Do NOT start execution
}
#endif
```

**Step 2**: Enable in CMakeLists.txt
```cmake
if(FRISCY_WIZER)
    list(APPEND FRISCY_LINK_FLAGS
        -sEXPORTED_FUNCTIONS=['_main','_wizer_init']
    )
endif()
```

**Step 3**: Run Wizer in build pipeline
```bash
# In harness.sh or friscy-pack
wizer --allow-wasi --wasm-bulk-memory true \
    friscy.wasm -o friscy-snapshot.wasm \
    --init-func wizer_init
```

---

## File Reference

```
friscy/
├── main.cpp                 # Entry point, machine setup, dynamic linker
│                            # Key functions:
│                            #   - main(): CLI parsing, orchestration
│                            #   - load_from_vfs(): Load binary from tar
│                            #   - setup_virtual_files(): /dev, /proc emulation
│
├── syscalls.hpp             # Linux syscall emulation (~50 syscalls)
│                            # Key namespaces:
│                            #   - syscalls::nr:: syscall numbers
│                            #   - syscalls::handlers:: handler functions
│                            #   - syscalls::install_syscalls(): registers all
│
├── vfs.hpp                  # Virtual filesystem from tar
│                            # Key classes:
│                            #   - VirtualFS: main filesystem class
│                            #   - Entry: file/directory node
│                            #   - FileHandle/DirHandle: open file state
│
├── elf_loader.hpp           # ELF parsing + dynamic linker support
│                            # Key namespaces:
│                            #   - elf:: ELF structures and parsing
│                            #   - dynlink:: auxiliary vector setup
│
├── network.hpp              # Socket syscalls (native + Wasm)
│                            # Key functions:
│                            #   - net::install_network_syscalls()
│                            #   - sys_socket, sys_connect, sys_sendto, etc.
│
├── network_bridge.js        # Browser WebSocket ↔ socket bridge
├── proxy/main.go       # Host-side WebSocket → real sockets
│
├── friscy-pack              # CLI tool: Docker image → browser bundle
│                            # Usage: friscy-pack myimage:latest --output bundle/
│
├── harness.sh               # Docker-based Emscripten build
├── CMakeLists.txt           # Build configuration with all options
│
├── aot/                 # RISC-V → Wasm AOT compiler
│   ├── Cargo.toml           # Rust dependencies
│   ├── README.md            # Build and usage instructions
│   └── src/
│       ├── main.rs          # CLI: rv2wasm input.elf -o output.wasm
│       ├── lib.rs           # Library entry: compile(elf_data, opt, debug)
│       ├── elf.rs           # ELF parsing with goblin
│       ├── disasm.rs        # RV64GC disassembler (80+ opcodes)
│       ├── cfg.rs           # Control flow graph construction
│       ├── translate.rs     # RISC-V → Wasm IR translation
│       └── wasm_builder.rs  # Wasm binary generation
│
├── tests/
│   ├── test_http_minimal.c  # HTTP client test
│   ├── test_server.py       # Simple HTTP server
│   └── run_network_test.sh  # Automated test script
│
├── ARCHITECTURE.md          # System design document
├── PERFORMANCE_ROADMAP.md   # This file
└── CRAZY_PERF_IDEAS.md      # Advanced optimization strategies
```

---

## Competitive Analysis

| Feature | WebVM | container2wasm | v86 | **friscy** |
|---------|-------|----------------|-----|------------|
| ISA | x86 (JIT) | x86 (Bochs) | x86 (JIT) | RISC-V (interp/AOT) |
| Boot time | 3-5s | 30-60s | 5-10s | **<500ms** |
| Kernel | Yes | Yes | Yes | **No (userland)** |
| Dynamic linking | Yes | Yes | Yes | **Yes** |
| Networking | Yes | Limited | Yes | **Yes** |
| Open source | No | Yes | Yes | **Yes** |
| Interpreted perf | ~15% | ~1% | ~10% | **~40%** |
| AOT perf | No | No | No | **~80% (target)** |

**Why friscy wins**:
1. **No kernel** = instant start, smaller Wasm
2. **RISC-V** = simpler ISA (47 base opcodes vs 1500+ x86)
3. **AOT compilation** = native Wasm speed
4. **Wizer snapshots** = instant warm start

---

## Next Steps (In Order)

### This Week
1. ⬜ Build and test rv2wasm with simple RISC-V binary
2. ⬜ Test Alpine busybox with dynamic linker
3. ⬜ Fix any missing syscalls discovered in testing

### Next Week
4. ⬜ Implement br_table dispatch in rv2wasm
5. ⬜ Add floating-point translation
6. ⬜ Integrate rv2wasm with friscy-pack --aot

### Following Week
7. ⬜ Implement Wizer snapshot support
8. ⬜ End-to-end test: Docker → browser with AOT
9. ⬜ Performance benchmarks vs WebVM

---

## Contributing

### Setting Up Development Environment

```bash
# Clone
git clone https://github.com/maceip/Bochs.git
cd Bochs/friscy

# Build native (for testing)
mkdir build-native && cd build-native
cmake .. -DCMAKE_BUILD_TYPE=Debug
make -j$(nproc)

# Build rv2wasm (requires Rust)
cd ../rv2wasm
cargo build

# Run tests
cd ..
./tests/run_network_test.sh
```

### Code Style
- C++20 for interpreter code
- Rust 2021 edition for rv2wasm
- Markdown for documentation
- No trailing whitespace

### Testing Changes
```bash
# Always test with a simple binary first
./build-native/friscy tests/hello

# Then test with a container
./build-native/friscy --rootfs alpine.tar /bin/busybox echo "hello"
```
