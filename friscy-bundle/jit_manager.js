// jit_manager.js - Runtime JIT compilation manager for friscy
//
// Tracks hot code regions in the RISC-V emulator and compiles them
// to native WebAssembly via rv2wasm_jit.wasm for accelerated execution.
//
// Architecture:
//   1. Interpreter runs RISC-V code, calls machine.stop() at certain PCs
//   2. JS resume loop checks JIT map before calling friscy_resume()
//   3. If JIT'd region exists for current PC, call region.run(m, pc)
//   4. run() chains blocks internally inside Wasm
//   5. JS falls back only on syscall / halt / region miss
//
// Protocol:
//   - run function: (param $m i32, $start_pc i32) -> (result i32)
//   - Return == -1 (0xFFFFFFFF): halt
//   - Return with high bit set: syscall marker (0x80000000 | pc)
//   - Otherwise: region miss PC (fallback to interpreter/other region)

class JITManager {
    constructor() {
        // Map<region_base, { run, instance, regionStart, regionEnd, tier }>
        this.compiledRegions = new Map();
        this.compilingRegions = new Set();

        // Execution counters for hot-region detection
        // Map<page_address, count>
        this.pageHitCounts = new Map();
        // Map<region_base, execution_count> used for baseline->optimized promotion
        this.regionHitCounts = new Map();

        // Compilation threshold (execute N times before JIT)
        this.hotThreshold = 50;
        // Region hit threshold for promoting baseline JIT regions to optimized tier
        this.optimizeThreshold = 200;
        this.tieringEnabled = true;
        this.traceEnabled = true;
        this.traceEdgeHotThreshold = 8;
        this.traceMaxEdges = 4096;
        // Map<"from_region:to_region", count>
        this.traceEdgeHits = new Map();

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
            baselineCompiles: 0,
            optimizedCompiles: 0,
            promotedRegions: 0,
            jitHits: 0,
            jitMisses: 0,
            compilationTimeMs: 0,
            dispatchCalls: 0,
            regionMisses: 0,
            traceEdgesObserved: 0,
            traceCompilesTriggered: 0,
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
     * Configure two-tier JIT promotion controls.
     */
    configureTiering({ enabled, optimizeThreshold } = {}) {
        if (typeof enabled === 'boolean') {
            this.tieringEnabled = enabled;
        }
        if (Number.isInteger(optimizeThreshold) && optimizeThreshold > 0) {
            this.optimizeThreshold = optimizeThreshold;
        }
    }

    /**
     * Configure trace-based hot-path promotion controls.
     */
    configureTrace({ enabled, edgeHotThreshold } = {}) {
        if (typeof enabled === 'boolean') {
            this.traceEnabled = enabled;
        }
        if (Number.isInteger(edgeHotThreshold) && edgeHotThreshold > 0) {
            this.traceEdgeHotThreshold = edgeHotThreshold;
        }
    }

    /**
     * Load the rv2wasm JIT compiler (compiled to wasm32 via wasm-bindgen)
     */
    async loadCompiler(url = 'rv2wasm_jit_bg.wasm') {
        if (this.jitCompiler) return;
        if (this.jitCompilerLoading) return this.jitCompilerLoading;

        this.jitCompilerLoading = (async () => {
            try {
                const {
                    default: init,
                    compile_region,
                    compile_region_fast,
                    compile_region_optimized,
                    version,
                } = await import('./rv2wasm_jit.js');
                await init(url);
                const hasFast = typeof compile_region_fast === 'function';
                const hasOptimized = typeof compile_region_optimized === 'function';
                this.jitCompiler = {
                    compile_region,
                    compile_region_fast: hasFast ? compile_region_fast : null,
                    compile_region_optimized: hasOptimized ? compile_region_optimized : null,
                    supportsTiering: hasFast && hasOptimized,
                    version,
                };
                console.log(
                    `[JIT] Compiler loaded: ${version()} ` +
                    `(tiering=${this.jitCompiler.supportsTiering ? 'on' : 'compat'})`
                );
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
        const upc = pc >>> 0;
        const page = upc & ~(this.pageSize - 1);
        const regionBase = upc & ~(this.regionSize - 1);

        // Already compiled?
        const existing = this.compiledRegions.get(regionBase);
        if (existing) {
            this.stats.jitHits++;
            // Track region heat and promote baseline regions to optimized tier.
            const regionHits = (this.regionHitCounts.get(regionBase) || 0) + 1;
            this.regionHitCounts.set(regionBase, regionHits);
            if (
                this.tieringEnabled &&
                this.jitCompiler &&
                this.jitCompiler.supportsTiering &&
                existing.tier !== 'optimized' &&
                regionHits >= this.optimizeThreshold &&
                !this.compilingRegions.has(regionBase)
            ) {
                this.compileRegion(regionBase, 'region-hot-promote', 'optimized').catch(e => {
                    console.warn(
                        `[JIT] Promotion compile failed for 0x${regionBase.toString(16)}:`,
                        e.message
                    );
                });
            }
            return true;
        }

        // Count page hits
        const count = (this.pageHitCounts.get(page) || 0) + 1;
        this.pageHitCounts.set(page, count);

        if (count >= this.hotThreshold && this.jitCompiler) {
            const hotRegionBase = page & ~(this.regionSize - 1);
            // Don't block — compile async and use on next hit
            if (!this.compiledRegions.has(hotRegionBase) && !this.compilingRegions.has(hotRegionBase)) {
                this.compileRegion(hotRegionBase, 'page-hot', 'baseline').catch(e => {
                    console.warn(`[JIT] Compile failed for 0x${hotRegionBase.toString(16)}:`, e.message);
                });
            }
        }

        this.stats.jitMisses++;
        return false;
    }

    /**
     * Record a cross-region transition observed during JIT dispatch.
     * If an edge becomes hot, proactively compile the target region.
     */
    recordTraceTransition(fromPc, toPc) {
        if (!this.traceEnabled) return;
        const fromRegion = (fromPc >>> 0) & ~(this.regionSize - 1);
        const toRegion = (toPc >>> 0) & ~(this.regionSize - 1);
        if (fromRegion === toRegion) return;

        const key = `${fromRegion.toString(16)}:${toRegion.toString(16)}`;
        if (!this.traceEdgeHits.has(key) && this.traceEdgeHits.size >= this.traceMaxEdges) {
            // Drop the oldest edge to keep memory bounded.
            const oldest = this.traceEdgeHits.keys().next().value;
            if (oldest !== undefined) {
                this.traceEdgeHits.delete(oldest);
            }
        }

        const count = (this.traceEdgeHits.get(key) || 0) + 1;
        this.traceEdgeHits.set(key, count);
        this.stats.traceEdgesObserved++;

        if (count < this.traceEdgeHotThreshold || !this.jitCompiler) return;
        if (this.compiledRegions.has(toRegion) || this.compilingRegions.has(toRegion)) return;

        this.stats.traceCompilesTriggered++;
        this.compileRegion(toRegion, 'trace-hot-edge', 'baseline').catch(e => {
            console.warn(
                `[JIT] Trace compile failed for 0x${toRegion.toString(16)} ` +
                `(from 0x${fromRegion.toString(16)}):`,
                e.message
            );
        });
    }

    /**
     * Try to get a compiled region for a given PC.
     * Returns region entry or null.
     */
    getCompiledRegion(pc) {
        const upc = pc >>> 0;
        const regionBase = upc & ~(this.regionSize - 1);
        const entry = this.compiledRegions.get(regionBase);
        if (!entry) return null;

        // Invalidate eagerly if any page in the region was dirtied.
        for (let page = entry.regionStart; page < entry.regionEnd; page += this.pageSize) {
            const normPage = page >>> 0;
            if (this.dirtyPages.has(normPage)) {
                this.invalidatePage(normPage);
                return null;
            }
        }

        return entry;
    }

    /**
     * Execute a JIT region for the given PC.
     * Returns { nextPC, isSyscall, isHalt, regionMiss? } or null.
     */
    execute(pc, machineStatePtr) {
        const region = this.getCompiledRegion(pc);
        if (!region) return null;

        this.stats.dispatchCalls++;
        const result = region.run(machineStatePtr, pc >>> 0);
        const value = result >>> 0;

        if (value === 0xFFFFFFFF) {
            return { nextPC: 0, isSyscall: false, isHalt: true };
        }
        if ((value & 0x80000000) !== 0) {
            return { nextPC: value & 0x7FFFFFFF, isSyscall: true, isHalt: false };
        }
        this.stats.regionMisses++;
        return { nextPC: value, isSyscall: false, isHalt: false, regionMiss: true };
    }

    /**
     * Compile a region of RISC-V code starting at the given page address.
     */
    async compileRegion(pageAddr, reason = 'manual', requestedTier = 'baseline') {
        if (!this.jitCompiler || !this.wasmMemory) return;

        const regionStart = (pageAddr >>> 0) & ~(this.regionSize - 1);
        const existing = this.compiledRegions.get(regionStart);
        if (existing && existing.tier === 'optimized') {
            return;
        }
        if (existing && requestedTier !== 'optimized') {
            return;
        }
        if (this.compilingRegions.has(regionStart)) {
            return;
        }
        this.compilingRegions.add(regionStart);

        const start = performance.now();
        try {
            // Read RISC-V bytes from the emulator's linear memory
            const memBuffer = new Uint8Array(this.wasmMemory.buffer);
            const regionEnd = Math.min(regionStart + this.regionSize, memBuffer.length);
            const codeBytes = memBuffer.slice(regionStart, regionEnd);

            // Compile to Wasm via rv2wasm
            let compileFn = null;
            let tier = requestedTier;
            if (
                tier === 'optimized' &&
                this.jitCompiler.compile_region_optimized &&
                this.tieringEnabled
            ) {
                compileFn = this.jitCompiler.compile_region_optimized;
            } else if (tier === 'baseline' && this.jitCompiler.compile_region_fast) {
                compileFn = this.jitCompiler.compile_region_fast;
            } else if (this.jitCompiler.compile_region) {
                compileFn = this.jitCompiler.compile_region;
                // Compatibility path for older compilers with single export.
                tier = 'compat';
            } else {
                return;
            }

            let wasmBytes;
            try {
                wasmBytes = compileFn(codeBytes, regionStart);
            } catch (e) {
                // Compilation can fail for regions with unsupported instructions.
                return;
            }

            // Instantiate the compiled Wasm module with shared memory.
            const importObject = {
                env: {
                    memory: this.wasmMemory,
                },
            };
            const { instance } = await WebAssembly.instantiate(wasmBytes, importObject);
            if (typeof instance.exports.run !== 'function') {
                throw new Error('compiled JIT module missing run export');
            }

            const previousTier = existing ? existing.tier : null;
            this.compiledRegions.set(regionStart, {
                run: instance.exports.run,
                instance,
                regionStart,
                regionEnd,
                tier,
            });

            const elapsed = performance.now() - start;
            this.stats.regionsCompiled++;
            this.stats.compilationTimeMs += elapsed;
            if (tier === 'optimized') {
                this.stats.optimizedCompiles++;
                if (previousTier && previousTier !== 'optimized') {
                    this.stats.promotedRegions++;
                }
            } else {
                this.stats.baselineCompiles++;
            }

            console.log(
                `[JIT] Compiled region 0x${regionStart.toString(16)} ` +
                `(${regionEnd - regionStart} bytes, ${elapsed.toFixed(1)}ms, reason=${reason}, tier=${tier})`
            );
        } finally {
            this.compilingRegions.delete(regionStart);
        }
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

        for (const [regionBase, entry] of this.compiledRegions) {
            if (page >= entry.regionStart && page < entry.regionEnd) {
                toDelete.push(regionBase);
            }
        }

        for (const regionBase of toDelete) {
            this.compiledRegions.delete(regionBase);
        }

        this.dirtyPages.delete(page);
        this.pageHitCounts.delete(page);
        this.regionHitCounts.delete(page & ~(this.regionSize - 1));

        if (toDelete.length > 0) {
            console.log(
                `[JIT] Invalidated ${toDelete.length} region(s) for page 0x${page.toString(16)}`
            );
        }
    }

    /**
     * Get JIT statistics for display.
     */
    getStats() {
        return {
            ...this.stats,
            compiledRegionCount: this.compiledRegions.size,
            hotPages: this.pageHitCounts.size,
            dirtyPages: this.dirtyPages.size,
            traceEdgesTracked: this.traceEdgeHits.size,
        };
    }

    /**
     * Reset all JIT state (e.g., after execve).
     */
    reset() {
        this.compiledRegions.clear();
        this.compilingRegions.clear();
        this.pageHitCounts.clear();
        this.regionHitCounts.clear();
        this.dirtyPages.clear();
        this.traceEdgeHits.clear();
        this.stats = {
            regionsCompiled: 0,
            baselineCompiles: 0,
            optimizedCompiles: 0,
            promotedRegions: 0,
            jitHits: 0,
            jitMisses: 0,
            compilationTimeMs: 0,
            dispatchCalls: 0,
            regionMisses: 0,
            traceEdgesObserved: 0,
            traceCompilesTriggered: 0,
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
