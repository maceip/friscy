# V8 Patches for Emscripten/WebAssembly Target

This directory contains patches needed to compile V8 for the Emscripten/WebAssembly target.

## Overview

V8 is a complex C++ engine with many platform-specific dependencies. For the Emscripten target,
we need to address:

1. **JIT Compilation**: V8's JIT (TurboFan/Liftoff) requires executable memory, which is not
   available in the Wasm sandbox. Solution: `--jitless` mode (interpreter only).

2. **WebAssembly in JITless**: Ironically, V8's WebAssembly support requires JIT. This is a
   fundamental incompatibility. Options:
   - Exclude WASM support entirely (run JS only)
   - Use Microsoft Edge's DrumBrake WASM interpreter approach
   - Accept limitation: JS engine without WASM execution

3. **Platform Abstraction**: V8 has platform-specific code for:
   - Threading (pthreads work on Wasm)
   - Memory allocation (use Emscripten's malloc)
   - File I/O (use Emscripten's FS)
   - Signals (not supported on Wasm)
   - Time/counters (use performance.now)

4. **Pointer Compression**: Critical for 32-bit Wasm. Must fit V8 heap in 4GB.

## Patch Status

| Patch | Status | Description |
|-------|--------|-------------|
| jitless-config | TODO | Force jitless mode, remove JIT dependencies |
| platform-wasm | TODO | Add wasm32-emscripten platform target |
| signals-stub | TODO | Stub out signal handling (not supported) |
| trap-handler | TODO | Disable trap handler (signals not available) |
| mmap-adapter | TODO | Route mmap to project's mmap-shim |

## Build Flags

From `configure.py` and V8's build system:

```python
# Force jitless
v8_enable_jitless = 1
v8_jit_less = True

# Pointer compression for 32-bit
v8_enable_pointer_compression = 1
v8_enable_31bit_smis_on_64bit_arch = 1

# Disable sandbox (not compatible with Emscripten)
v8_enable_sandbox = 0

# External startup data complicates linking
v8_use_external_startup_data = 0

# Reduced ICU size
v8_icu_small = 1
```

## References

- [V8 JITless Mode](https://v8.dev/blog/jitless)
- [V8 Build Configuration](https://v8.dev/docs/build)
- [V8 Pointer Compression](https://v8.dev/blog/pointer-compression)
