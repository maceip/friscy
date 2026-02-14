// jit_manager.js - Runtime JIT compilation manager for friscy
//
// Tracks hot code regions in the RISC-V emulator and compiles them
// to native WebAssembly via rv2wasm_jit.wasm for accelerated execution.
//
// Architecture:
//   1. Interpreter runs RISC-V code, calls machine.stop() at certain PCs
//   2. JS resume loop checks JIT map before calling friscy_resume()
//   3. If JIT'd function exists for current PC, call it directly
//   4. JIT'd function returns next PC (or syscall marker)
//   5. JS dispatches: chain to next JIT'd block, or fall back to interpreter
//
// Protocol:
//   - Block functions: (param $m i32) -> (result i32)
//   - Return < 0x80000000: next PC to execute
//   - Return >= 0x80000000: syscall (pass to friscy_resume with high bit)
//   - Return == -1 (0xFFFFFFFF): halt

class JITManager {
    constructor() {
        // Map<pc_address, { wasmFunc, module, instance, hitCount }>
        this.compiledBlocks = new Map();

        // Execution counters for hot-region detection
        // Map<page_address, count>
        this.pageHitCounts = new Map();

        // Compilation threshold (execute N times before JIT)
        this.hotThreshold = 50;

        // Region size for compilation (16KB)
        this.regionSize = 16384;

        // Page size for tracking (4KB)
        this.pageSize = 4096;

        // rv2wasm JIT compiler module (loaded lazily)
        this.jitCompiler = null;
        this.jitCompilerLoading = null;

        // Reference to Emscripten's WebAssembly.Memory
        this.wasmMemory = null;

        // Stats
        this.stats = {
            regionsCompiled: 0,
            jitHits: 0,
            jitMisses: 0,
            compilationTimeMs: 0,
        };

        // Invalidation bitmap (1 bit per 4KB page)
        // When a page is written via mprotect(PROT_WRITE), its JIT'd code is invalidated
        this.dirtyPages = new Set();
    }

    /**
     * Initialize with the Emscripten module's WebAssembly.Memory
     */
    init(wasmMemory) {
        this.wasmMemory = wasmMemory;
    }

    /**
     * Load the rv2wasm JIT compiler (compiled to wasm32 via wasm-bindgen)
     */
    async loadCompiler(url = 'rv2wasm_jit_bg.wasm') {
        if (this.jitCompiler) return;
        if (this.jitCompilerLoading) return this.jitCompilerLoading;

        this.jitCompilerLoading = (async () => {
            try {
                const { default: init, compile_region, version } = await import('./rv2wasm_jit.js');
                await init(url);
                this.jitCompiler = { compile_region, version };
                console.log(`[JIT] Compiler loaded: ${version()}`);
            } catch (e) {
                console.warn('[JIT] Failed to load compiler:', e.message);
                this.jitCompiler = null;
            }
        })();

        return this.jitCompilerLoading;
    }

    /**
     * Record a PC execution and check if the containing page is hot.
     * Returns true if this PC now has a JIT'd function available.
     */
    recordExecution(pc) {
        const page = (pc >>> 0) & ~(this.pageSize - 1);

        // Already compiled?
        if (this.compiledBlocks.has(pc)) {
            this.stats.jitHits++;
            return true;
        }

        // Count page hits
        const count = (this.pageHitCounts.get(page) || 0) + 1;
        this.pageHitCounts.set(page, count);

        if (count >= this.hotThreshold && this.jitCompiler) {
            // Don't block — compile async and use on next hit
            this.compileRegion(page).catch(e => {
                console.warn(`[JIT] Compile failed for 0x${page.toString(16)}:`, e.message);
            });
        }

        this.stats.jitMisses++;
        return false;
    }

    /**
     * Try to get a JIT'd function for a given PC.
     * Returns the Wasm function or null.
     */
    getCompiledFunction(pc) {
        const entry = this.compiledBlocks.get(pc);
        if (!entry) return null;

        // Check if the page has been dirtied (invalidated)
        const page = (pc >>> 0) & ~(this.pageSize - 1);
        if (this.dirtyPages.has(page)) {
            this.invalidatePage(page);
            return null;
        }

        return entry.wasmFunc;
    }

    /**
     * Execute a JIT'd function for the given PC.
     * Returns { nextPC, isSyscall, isHalt }
     */
    execute(pc, machineStatePtr) {
        const func = this.getCompiledFunction(pc);
        if (!func) return null;

        const result = func(machineStatePtr);

        if (result === -1 || result === 0xFFFFFFFF) {
            return { nextPC: 0, isSyscall: false, isHalt: true };
        }
        if ((result & 0x80000000) !== 0) {
            return { nextPC: result, isSyscall: true, isHalt: false };
        }
        return { nextPC: result, isSyscall: false, isHalt: false };
    }

    /**
     * Compile a region of RISC-V code starting at the given page address.
     */
    async compileRegion(pageAddr) {
        if (!this.jitCompiler || !this.wasmMemory) return;

        const start = performance.now();

        // Read RISC-V bytes from the emulator's linear memory
        const memBuffer = new Uint8Array(this.wasmMemory.buffer);
        const regionStart = pageAddr;
        const regionEnd = Math.min(regionStart + this.regionSize, memBuffer.length);
        const codeBytes = memBuffer.slice(regionStart, regionEnd);

        // Compile to Wasm via rv2wasm
        let wasmBytes;
        try {
            wasmBytes = this.jitCompiler.compile_region(codeBytes, regionStart);
        } catch (e) {
            // Compilation can fail for regions with unsupported instructions
            return;
        }

        // Instantiate the compiled Wasm module with shared memory
        const importObject = {
            env: {
                memory: this.wasmMemory,
            },
        };

        const { instance } = await WebAssembly.instantiate(wasmBytes, importObject);

        // Register all exported block functions
        for (const [name, func] of Object.entries(instance.exports)) {
            if (typeof func === 'function' && name.startsWith('block_')) {
                const addr = parseInt(name.substring(6), 16);
                if (!isNaN(addr)) {
                    this.compiledBlocks.set(addr, {
                        wasmFunc: func,
                        instance,
                        regionStart,
                    });
                }
            }
        }

        const elapsed = performance.now() - start;
        this.stats.regionsCompiled++;
        this.stats.compilationTimeMs += elapsed;

        console.log(
            `[JIT] Compiled region 0x${pageAddr.toString(16)} ` +
            `(${Object.keys(instance.exports).length} blocks, ${elapsed.toFixed(1)}ms)`
        );
    }

    /**
     * Mark a page as dirty (code was modified via mprotect/mmap).
     * Called from the emulator's mprotect syscall handler.
     */
    markPageDirty(pageAddr) {
        this.dirtyPages.add(pageAddr & ~(this.pageSize - 1));
    }

    /**
     * Invalidate all JIT'd functions in a dirty page.
     */
    invalidatePage(pageAddr) {
        const page = pageAddr & ~(this.pageSize - 1);
        const toDelete = [];

        for (const [pc, entry] of this.compiledBlocks) {
            if ((pc & ~(this.pageSize - 1)) === page) {
                toDelete.push(pc);
            }
        }

        for (const pc of toDelete) {
            this.compiledBlocks.delete(pc);
        }

        this.dirtyPages.delete(page);
        this.pageHitCounts.delete(page);

        if (toDelete.length > 0) {
            console.log(
                `[JIT] Invalidated ${toDelete.length} blocks in page 0x${page.toString(16)}`
            );
        }
    }

    /**
     * Get JIT statistics for display.
     */
    getStats() {
        return {
            ...this.stats,
            compiledBlockCount: this.compiledBlocks.size,
            hotPages: this.pageHitCounts.size,
            dirtyPages: this.dirtyPages.size,
        };
    }

    /**
     * Reset all JIT state (e.g., after execve).
     */
    reset() {
        this.compiledBlocks.clear();
        this.pageHitCounts.clear();
        this.dirtyPages.clear();
        this.stats = {
            regionsCompiled: 0,
            jitHits: 0,
            jitMisses: 0,
            compilationTimeMs: 0,
        };
    }
}

// Singleton
const jitManager = new JITManager();

/**
 * Install the JIT invalidation callback on the Emscripten Module object.
 * Called from C++ via EM_ASM when mprotect(PROT_WRITE), MAP_FIXED mmap,
 * or munmap modifies pages that may contain JIT-compiled code.
 *
 * Usage: call installInvalidationHook(Module) after Emscripten module init.
 */
export function installInvalidationHook(Module) {
    Module._jitInvalidateRange = function(addr, len) {
        const pageSize = jitManager.pageSize;
        const pageMask = ~(pageSize - 1);
        const startPage = (addr & pageMask) >>> 0;
        const endAddr = (addr + len) >>> 0;

        for (let page = startPage; page < endAddr; page = (page + pageSize) >>> 0) {
            jitManager.markPageDirty(page);
        }
    };
}

export default jitManager;
