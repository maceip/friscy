# Node.js Emscripten Build - Development Roadmap

## Project: Kasm Phase 4 - Node.js to Wasm
## Timeline: 4-6 weeks (as per .hint/ARCHITECTURE.md)
## Started: March 17, 2026

---

## Current Status

✅ **Infrastructure Complete** (March 17)
- Makefile with all Emscripten flags
- libuv_jspi.c adapter template
- V8 patches documentation
- Build preparation script
- mmap-shim dependency ready (Phase 3 complete)
- LKL kernel.wasm built (Phase 1 complete)

🔄 **Starting Iterative Development**

---

## Week-by-Week Plan

### Week 1: Foundation & V8 Configuration

**Day 1-2: Build System Setup**
- [ ] Run Node.js configure with custom options
- [ ] Identify all platform-specific code blocks
- [ ] Create v8_patches/01_jitless.patch - Force jitless mode
- [ ] Create v8_patches/02_platform_wasm.patch - Add wasm32 platform

**Day 3-4: V8 Standalone Test**
- [ ] Attempt to build V8 d8 shell only
- [ ] Fix compilation errors iteratively
- [ ] Document all platform incompatibility points

**Day 5: Integration Planning**
- [ ] Map out V8 → Node.js dependency chain
- [ ] Identify libuv integration points
- [ ] Plan mmap-shim linkage strategy

**Milestone:** `d8` (V8 shell) compiles and runs simple JS

---

### Week 2: libuv & Async I/O

**Day 1-2: libuv Analysis**
- [ ] Audit libuv for platform-specific code
- [ ] Identify epoll/kqueue/IOCP usage points
- [ ] Map browser equivalents (File System Access API, fetch, etc.)

**Day 3-4: JSPI Implementation**
- [ ] Implement uv__emscripten_poll
- [ ] Implement async file read/write
- [ ] Implement timer wrappers
- [ ] Test with libuv test suite

**Day 5: Network Layer**
- [ ] Replace TCP/UDP with WebTransport bridge
- [ ] Implement DNS via browser fetch
- [ ] Test network I/O

**Milestone:** libuv test suite passes on Emscripten target

---

### Week 3: Node.js Core Integration

**Day 1-2: Build Node.js without V8**
- [ ] Configure Node.js build with --without-v8
- [ ] Build Node.js runtime components
- [ ] Test Node.js native addon loading (stub)

**Day 3-4: V8 Integration**
- [ ] Link V8 into Node.js build
- [ ] Fix Node.js → V8 API calls
- [ ] Implement jitless V8 startup

**Day 5: First Test**
- [ ] Build node.wasm (first successful link)
- [ ] Test basic startup
- [ ] Debug and fix startup errors

**Milestone:** `node.wasm` builds without linker errors

---

### Week 4: mmap-shim & Memory

**Day 1-2: mmap Integration**
- [ ] Link mmap-shim into Node.js build
- [ ] Route V8 memory allocation to mmap-shim
- [ ] Test pointer compression with mmap arena

**Day 3-4: V8 Heap Cage**
- [ ] Configure V8 pointer compression for mmap arena
- [ ] Handle MAP_FIXED for heap reservation
- [ ] Test guard page handling

**Day 5: Memory Testing**
- [ ] Stress test memory allocation
- [ ] Test large heap scenarios (2-4GB)
- [ ] Verify no memory leaks

**Milestone:** V8 initializes heap correctly via mmap-shim

---

### Week 5: Syscalls & LKL Integration

**Day 1-2: Syscall Middleware**
- [ ] Build syscall dispatch layer
- [ ] Connect Node.js syscalls to LKL kernel
- [ ] Test basic file I/O

**Day 3-4: Process Model**
- [ ] Test process spawning via Workers
- [ ] Test fork/vfork patterns
- [ ] Test pipe communication

**Day 5: Integration Testing**
- [ ] Test Node.js fs module
- [ ] Test require() loading JS files
- [ ] Test module resolution

**Milestone:** `require('fs').readFileSync()` works via LKL kernel

---

### Week 6: Final Integration & Testing

**Day 1-2: Basic JS Execution**
- [ ] Test: `node -e "console.log(1+1)"` → "2"
- [ ] Test: `node script.js` simple scripts
- [ ] Debug any V8 runtime issues

**Day 3-4: Module System**
- [ ] Test npm modules loading
- [ ] Test native addon stubs
- [ ] Test networking modules

**Day 5: Full Pipeline**
- [ ] Test: bash → node execution via exec()
- [ ] Load real application (Claude CLI)
- [ ] Performance tuning

**Final Milestone:** `bash -c "node claude.js 'write a haiku'"` works end-to-end

---

## Daily Development Workflow

```bash
# Each day, iterate on:
cd /home/devuser/kasm/programs/node

# 1. Apply patches
make patch-v8
make patch-libuv

# 2. Configure
emconfigure ./configure --dest-cpu=wasm32 ...

# 3. Build
emmake make 2>&1 | tee build.log

# 4. Test
cd tests
node test_node_hello.js

# 5. Debug, patch, repeat
```

---

## Key Technical Challenges & Solutions

### Challenge 1: V8 JITless + WASM Incompatibility
**Problem:** WASM requires JIT, jitless disables JIT
**Solution:** Disable WASM support in V8 (`V8_DISABLE_WASM=1`)
**Impact:** Node.js can run JS but not load `.wasm` modules

### Challenge 2: libuv Platform Abstraction
**Problem:** epoll/kqueue/IOCP not available in browser
**Solution:** JSPI-based async I/O with browser APIs
**Impact:** Full async I/O compatibility

### Challenge 3: mmap for V8 Heap
**Problem:** V8 needs mmap API, kernel can't do virtual memory in Wasm
**Solution:** mmap-shim in userspace (already built in Phase 3)
**Impact:** V8 heap works correctly

### Challenge 4: Signal Handling
**Problem:** POSIX signals not supported in Wasm
**Solution:** Stub signal handlers, use alternative mechanisms
**Impact:** Limited signal support (acceptable for CLI apps)

### Challenge 5: Binary Size
**Problem:** ~50-80MB output
**Solution:** Gzip compression (~10-15MB), OPFS caching
**Impact:** First load slow, subsequent loads instant

---

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| V8 too complex to port | Medium | High | Start with d8 shell only |
| libuv incompatible | Medium | High | Use Asyncify if JSPI fails |
| mmap-shim insufficient | Low | High | Extend allocator as needed |
| Performance unacceptable | Medium | Medium | Profile and optimize hot paths |
| 6 weeks insufficient | Medium | Medium | Prioritize core features first |

---

## Success Criteria (per .hint file)

1. ✅ `echo hello | cat` → "hello" (busybox + kernel pipes)
2. ✅ `ls /` → rootfs directory listing (kernel VFS)
3. 🎯 `node -e "console.log(1+1)"` → "2" (V8 + mmap shim)
4. 🎯 `node -e "require('fs').readdirSync('/')"` → rootfs listing
5. 🎯 `node -e "fetch('https://httpbin.org/get')"` → HTTP response
6. 🎯 `bash -c "node claude.js 'write a haiku'"` → haiku output
7. 🎯 Performance: `claude --version` < 15s

---

## References

- Parent: [.hint](/home/devuser/kasm/.hint) - Full architecture specification
- Parent: [docs/ARCHITECTURE.md](/home/devuser/kasm/docs/ARCHITECTURE.md) - Detailed design
- Related: [mmap-shim/](/home/devuser/kasm/mmap-shim/) - Phase 3 dependency
- Related: [kernel/](/home/devuser/kasm/kernel/) - Phase 1 dependency
- This: [BUILD_STATUS.md](BUILD_STATUS.md) - Detailed technical assessment
- This: [Makefile](Makefile) - Build orchestration

---

## Notes

- **Author**: zzj-stare (from git history)
- **Start Date**: March 17, 2026
- **Estimated Completion**: April 28, 2026 (6 weeks)
- **Status**: Infrastructure complete, beginning iterative development

**Next Action**: Begin Week 1 Day 1 - V8 configuration and first build attempt.
