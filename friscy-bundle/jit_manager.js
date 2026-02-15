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
        this.tripletEnabled = true;
        this.markovEnabled = true;
        this.traceEdgeHotThreshold = 8;
        this.traceTripletHotThreshold = 6;
        this.traceMaxEdges = 4096;
        this.traceMaxTriplets = 8192;
        // Map<"from_region:to_region", count>
        this.traceEdgeHits = new Map();
        // Map<"a_region:b_region:c_region", count>
        this.traceTripletHits = new Map();
        this.lastTraceEdge = null;
        // Markov transition probabilities:
        // Map<from_region, Map<to_region, count>>
        this.markovTransitions = new Map();
        this.markovTotals = new Map();
        // Map<context "a:b", Map<c, count>>
        this.markovContextTransitions = new Map();
        this.markovContextTotals = new Map();

        // Region size for compilation (16KB)
        this.regionSize = 16384;

        // Page size for tracking (4KB)
        this.pageSize = 4096;

        // rv2wasm JIT compiler module (loaded lazily)
        this.jitCompiler = null;
        this.jitCompilerLoading = null;

        // Reference to Emscripten's WebAssembly.Memory
        this.wasmMemory = null;

        // Demand / failure tracking
        this.regionMissDemandCounts = new Map();
        // Map<region_base, { count, cooldownUntilMs, lastFailMs, lastError }>
        this.compileFailureState = new Map();
        this.failureBaseCooldownMs = 2000;
        this.failureMaxCooldownMs = 120000;

        // Scheduler / queue
        this.compileQueue = [];
        this.compileQueueMax = 128;
        this.compileBudgetPerSecond = 6;
        this.maxConcurrentCompiles = 1;
        this.activeCompileCount = 0;
        this.compileTokens = this.compileBudgetPerSecond;
        this.lastBudgetRefillMs = performance.now();
        this.schedulerIntervalMs = 100;
        this.schedulerTimer = null;

        // Predictor controls
        this.predictorTopK = 2;
        this.predictorBaseConfidenceThreshold = 0.55;

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
            traceTripletsObserved: 0,
            traceTripletCompilesTriggered: 0,
            markovPredictionsEvaluated: 0,
            markovPredictionsAccepted: 0,
            predictorHits: 0,
            predictorMisses: 0,
            compileQueueEnqueued: 0,
            compileQueueDropped: 0,
            compileQueuePeak: 0,
            compileFailures: 0,
            cooldownDeferrals: 0,
            stalePrunes: 0,
            missesBeforeSteady: -1,
        };

        // Regions that were proactively predicted for compile:
        // Map<region_base, { atMs, used }>
        this.predictedRegions = new Map();
        this.steadyStateReached = false;

        // Invalidation bitmap (1 bit per 4KB page)
        // When a page is written via mprotect(PROT_WRITE), its JIT'd code is invalidated
        this.dirtyPages = new Set();
    }

    /**
     * Initialize with the Emscripten module's WebAssembly.Memory
     */
    init(wasmMemory) {
        this.wasmMemory = wasmMemory;
        this.ensureSchedulerRunning();
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
    configureTrace({ enabled, edgeHotThreshold, tripletHotThreshold } = {}) {
        if (typeof enabled === 'boolean') {
            this.traceEnabled = enabled;
            if (!enabled) {
                this.lastTraceEdge = null;
            }
        }
        if (Number.isInteger(edgeHotThreshold) && edgeHotThreshold > 0) {
            this.traceEdgeHotThreshold = edgeHotThreshold;
        }
        if (Number.isInteger(tripletHotThreshold) && tripletHotThreshold > 0) {
            this.traceTripletHotThreshold = tripletHotThreshold;
        }
    }

    /**
     * Configure compile scheduler and prediction controls.
     */
    configureScheduler({
        compileBudgetPerSecond,
        maxConcurrentCompiles,
        compileQueueMax,
        predictorTopK,
        predictorBaseConfidenceThreshold,
    } = {}) {
        if (Number.isFinite(compileBudgetPerSecond) && compileBudgetPerSecond > 0) {
            this.compileBudgetPerSecond = Math.max(0.5, compileBudgetPerSecond);
            this.compileTokens = Math.min(this.compileTokens, this.compileBudgetPerSecond);
        }
        if (Number.isInteger(maxConcurrentCompiles) && maxConcurrentCompiles > 0) {
            this.maxConcurrentCompiles = maxConcurrentCompiles;
        }
        if (Number.isInteger(compileQueueMax) && compileQueueMax > 8) {
            this.compileQueueMax = compileQueueMax;
        }
        if (Number.isInteger(predictorTopK) && predictorTopK > 0) {
            this.predictorTopK = predictorTopK;
        }
        if (Number.isFinite(predictorBaseConfidenceThreshold)) {
            this.predictorBaseConfidenceThreshold = Math.min(0.95, Math.max(0.1, predictorBaseConfidenceThreshold));
        }
    }

    configurePredictor({ markovEnabled, tripletEnabled } = {}) {
        if (typeof markovEnabled === 'boolean') {
            this.markovEnabled = markovEnabled;
        }
        if (typeof tripletEnabled === 'boolean') {
            this.tripletEnabled = tripletEnabled;
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

    ensureSchedulerRunning() {
        if (this.schedulerTimer !== null) return;
        this.schedulerTimer = setInterval(() => {
            this.processCompileQueue();
        }, this.schedulerIntervalMs);
    }

    refillCompileTokens(nowMs = performance.now()) {
        const elapsedMs = Math.max(0, nowMs - this.lastBudgetRefillMs);
        this.lastBudgetRefillMs = nowMs;
        const refill = (elapsedMs / 1000) * this.compileBudgetPerSecond;
        this.compileTokens = Math.min(this.compileBudgetPerSecond, this.compileTokens + refill);
    }

    getQueuePressure() {
        if (this.compileQueueMax <= 0) return 1;
        return Math.min(1, this.compileQueue.length / this.compileQueueMax);
    }

    getMissRate() {
        const denom = Math.max(1, this.stats.dispatchCalls);
        return this.stats.regionMisses / denom;
    }

    getAdaptiveThresholds() {
        const missRate = this.getMissRate();
        const queuePressure = this.getQueuePressure();
        const confidenceThreshold = Math.min(
            0.95,
            Math.max(
                0.15,
                this.predictorBaseConfidenceThreshold +
                    queuePressure * 0.25 -
                    Math.min(0.5, missRate) * 0.2
            )
        );
        const scale = Math.min(
            2.0,
            Math.max(0.5, 1 + queuePressure * 0.8 - Math.min(0.6, missRate) * 0.5)
        );
        const edgeThreshold = Math.max(1, Math.round(this.traceEdgeHotThreshold * scale));
        const tripletThreshold = Math.max(1, Math.round(this.traceTripletHotThreshold * scale));
        return { confidenceThreshold, edgeThreshold, tripletThreshold };
    }

    computeMissCost(regionBase) {
        const demand = this.regionMissDemandCounts.get(regionBase) || 0;
        return 1 + Math.log2(1 + demand);
    }

    getFailureState(regionBase) {
        return this.compileFailureState.get(regionBase) || null;
    }

    isInCooldown(regionBase, nowMs = performance.now()) {
        const state = this.getFailureState(regionBase);
        if (!state) return false;
        return nowMs < state.cooldownUntilMs;
    }

    registerCompileFailure(regionBase, error) {
        const nowMs = performance.now();
        const prev = this.compileFailureState.get(regionBase);
        const count = (prev?.count || 0) + 1;
        const cooldown = Math.min(
            this.failureMaxCooldownMs,
            this.failureBaseCooldownMs * Math.pow(2, Math.min(7, count - 1))
        );
        this.compileFailureState.set(regionBase, {
            count,
            cooldownUntilMs: nowMs + cooldown,
            lastFailMs: nowMs,
            lastError: error ? String(error) : 'unknown',
        });
        this.stats.compileFailures++;
    }

    clearCompileFailure(regionBase) {
        this.compileFailureState.delete(regionBase);
    }

    queueCompileRequest(regionBase, {
        reason = 'manual',
        requestedTier = 'baseline',
        confidence = 1.0,
        source = 'direct',
        missCost = null,
        markPredicted = false,
    } = {}) {
        const nowMs = performance.now();
        if (!Number.isFinite(regionBase)) return false;
        if (!this.jitCompiler || !this.wasmMemory) return false;

        const alignedRegion = (regionBase >>> 0) & ~(this.regionSize - 1);
        const existing = this.compiledRegions.get(alignedRegion);
        if (existing && existing.tier === 'optimized') return false;
        if (existing && requestedTier !== 'optimized') return false;
        if (this.compilingRegions.has(alignedRegion)) return false;
        if (this.isInCooldown(alignedRegion, nowMs)) {
            this.stats.cooldownDeferrals++;
            return false;
        }

        const effectiveMissCost = missCost ?? this.computeMissCost(alignedRegion);
        const clampedConfidence = Math.max(0.001, Math.min(1, confidence));
        const priority = clampedConfidence * effectiveMissCost;

        const existingIdx = this.compileQueue.findIndex(
            (task) => task.regionBase === alignedRegion
        );
        const newTask = {
            regionBase: alignedRegion,
            reason,
            requestedTier,
            confidence: clampedConfidence,
            missCost: effectiveMissCost,
            priority,
            source,
            enqueuedAtMs: nowMs,
            markPredicted,
        };

        if (existingIdx >= 0) {
            const old = this.compileQueue[existingIdx];
            // Keep strongest task.
            if (old.priority >= newTask.priority) {
                return false;
            }
            this.compileQueue.splice(existingIdx, 1);
        } else if (this.compileQueue.length >= this.compileQueueMax) {
            // Drop lowest-priority task if queue is saturated.
            this.compileQueue.sort((a, b) => a.priority - b.priority);
            if (this.compileQueue[0].priority >= newTask.priority) {
                this.stats.compileQueueDropped++;
                return false;
            }
            this.compileQueue.shift();
            this.stats.compileQueueDropped++;
        }

        this.compileQueue.push(newTask);
        this.compileQueue.sort((a, b) => {
            if (b.priority !== a.priority) return b.priority - a.priority;
            return a.enqueuedAtMs - b.enqueuedAtMs;
        });
        this.stats.compileQueueEnqueued++;
        if (this.compileQueue.length > this.stats.compileQueuePeak) {
            this.stats.compileQueuePeak = this.compileQueue.length;
        }
        if (markPredicted) {
            this.predictedRegions.set(alignedRegion, { atMs: nowMs, used: false });
        }

        this.ensureSchedulerRunning();
        return true;
    }

    async processCompileQueue() {
        if (!this.jitCompiler || !this.wasmMemory) return;
        this.refillCompileTokens();

        while (
            this.compileQueue.length > 0 &&
            this.activeCompileCount < this.maxConcurrentCompiles &&
            this.compileTokens >= 1
        ) {
            const task = this.compileQueue.shift();
            if (!task) break;

            if (this.isInCooldown(task.regionBase)) {
                this.stats.cooldownDeferrals++;
                continue;
            }

            this.compileTokens -= 1;
            this.activeCompileCount++;
            this.compileRegion(task.regionBase, task.reason, task.requestedTier)
                .catch((e) => {
                    console.warn(
                        `[JIT] Scheduled compile failed for 0x${task.regionBase.toString(16)}:`,
                        e.message
                    );
                })
                .finally(() => {
                    this.activeCompileCount = Math.max(0, this.activeCompileCount - 1);
                    // Steady-state approximation: queue drained after warmup activity.
                    if (
                        !this.steadyStateReached &&
                        this.stats.compileQueueEnqueued > 0 &&
                        this.compileQueue.length === 0 &&
                        this.activeCompileCount === 0
                    ) {
                        this.steadyStateReached = true;
                        this.stats.missesBeforeSteady = this.stats.regionMisses;
                    }
                });
        }
    }

    recordMarkovTransition(fromRegion, toRegion) {
        let toMap = this.markovTransitions.get(fromRegion);
        if (!toMap) {
            toMap = new Map();
            this.markovTransitions.set(fromRegion, toMap);
        }
        toMap.set(toRegion, (toMap.get(toRegion) || 0) + 1);
        this.markovTotals.set(fromRegion, (this.markovTotals.get(fromRegion) || 0) + 1);
    }

    recordMarkovContextTransition(contextKey, toRegion) {
        let toMap = this.markovContextTransitions.get(contextKey);
        if (!toMap) {
            toMap = new Map();
            this.markovContextTransitions.set(contextKey, toMap);
        }
        toMap.set(toRegion, (toMap.get(toRegion) || 0) + 1);
        this.markovContextTotals.set(contextKey, (this.markovContextTotals.get(contextKey) || 0) + 1);
    }

    getTopPredictionsForSource(fromRegion) {
        const total = this.markovTotals.get(fromRegion) || 0;
        if (total <= 0) return [];
        const toMap = this.markovTransitions.get(fromRegion);
        if (!toMap) return [];
        return [...toMap.entries()]
            .map(([regionBase, count]) => ({
                regionBase,
                confidence: count / total,
                source: 'markov1',
            }))
            .sort((a, b) => b.confidence - a.confidence);
    }

    getTopPredictionsForContext(contextKey) {
        const total = this.markovContextTotals.get(contextKey) || 0;
        if (total <= 0) return [];
        const toMap = this.markovContextTransitions.get(contextKey);
        if (!toMap) return [];
        return [...toMap.entries()]
            .map(([regionBase, count]) => ({
                regionBase,
                confidence: count / total,
                source: 'markov2',
            }))
            .sort((a, b) => b.confidence - a.confidence);
    }

    scheduleMarkovPredictions(fromRegion, toRegion, prevFromRegion = null) {
        if (!this.markovEnabled || !this.traceEnabled) return;

        const { confidenceThreshold } = this.getAdaptiveThresholds();
        const firstOrder = this.getTopPredictionsForSource(toRegion);
        const contextKey = prevFromRegion !== null
            ? `${prevFromRegion.toString(16)}:${toRegion.toString(16)}`
            : null;
        const secondOrder = contextKey ? this.getTopPredictionsForContext(contextKey) : [];

        const merged = new Map();
        for (const item of firstOrder) {
            merged.set(item.regionBase, {
                regionBase: item.regionBase,
                confidence: item.confidence,
                source: item.source,
            });
        }
        for (const item of secondOrder) {
            const boosted = Math.min(1, item.confidence * 1.1);
            const existing = merged.get(item.regionBase);
            if (!existing || boosted > existing.confidence) {
                merged.set(item.regionBase, {
                    regionBase: item.regionBase,
                    confidence: boosted,
                    source: item.source,
                });
            }
        }

        const candidates = [...merged.values()]
            .filter((c) => c.regionBase !== fromRegion && c.regionBase !== toRegion)
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, this.predictorTopK);

        this.stats.markovPredictionsEvaluated += candidates.length;

        for (const cand of candidates) {
            if (cand.confidence < confidenceThreshold) continue;
            const missCost = this.computeMissCost(cand.regionBase);
            const accepted = this.queueCompileRequest(cand.regionBase, {
                reason: `${cand.source}-predict`,
                requestedTier: 'baseline',
                confidence: cand.confidence,
                source: cand.source,
                missCost,
                markPredicted: true,
            });
            if (accepted) {
                this.stats.markovPredictionsAccepted++;
            }
        }
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
            const predicted = this.predictedRegions.get(regionBase);
            if (predicted && !predicted.used) {
                predicted.used = true;
                this.predictedRegions.set(regionBase, predicted);
                this.stats.predictorHits++;
            }
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
                this.queueCompileRequest(regionBase, {
                    reason: 'region-hot-promote',
                    requestedTier: 'optimized',
                    confidence: 1,
                    source: 'tiering',
                });
            }
            return true;
        }

        const predicted = this.predictedRegions.get(regionBase);
        if (predicted && !predicted.used) {
            this.stats.predictorMisses++;
            this.predictedRegions.delete(regionBase);
        }

        this.regionMissDemandCounts.set(
            regionBase,
            (this.regionMissDemandCounts.get(regionBase) || 0) + 1
        );

        // Count page hits
        const count = (this.pageHitCounts.get(page) || 0) + 1;
        this.pageHitCounts.set(page, count);

        if (count >= this.hotThreshold && this.jitCompiler) {
            const hotRegionBase = page & ~(this.regionSize - 1);
            // Don't block — compile async and use on next hit
            if (!this.compiledRegions.has(hotRegionBase) && !this.compilingRegions.has(hotRegionBase)) {
                this.queueCompileRequest(hotRegionBase, {
                    reason: 'page-hot',
                    requestedTier: 'baseline',
                    confidence: 1,
                    source: 'page-hot',
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

        const prevEdge = this.lastTraceEdge;
        this.lastTraceEdge = { from: fromRegion, to: toRegion };
        const { edgeThreshold, tripletThreshold } = this.getAdaptiveThresholds();

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
        this.recordMarkovTransition(fromRegion, toRegion);

        // Build second-order trace signal:
        // if we observed A->B and now see B->C, count triplet A->B->C.
        let scheduledCompile = false;
        const canCompileRegion = this.jitCompiler;

        if (prevEdge && prevEdge.to === fromRegion) {
            const contextKey = `${prevEdge.from.toString(16)}:${fromRegion.toString(16)}`;
            this.recordMarkovContextTransition(contextKey, toRegion);
        }

        if (this.tripletEnabled && prevEdge && prevEdge.to === fromRegion) {
            const tripletKey = `${prevEdge.from.toString(16)}:${fromRegion.toString(16)}:${toRegion.toString(16)}`;
            if (
                !this.traceTripletHits.has(tripletKey) &&
                this.traceTripletHits.size >= this.traceMaxTriplets
            ) {
                const oldest = this.traceTripletHits.keys().next().value;
                if (oldest !== undefined) {
                    this.traceTripletHits.delete(oldest);
                }
            }

            const tripletCount = (this.traceTripletHits.get(tripletKey) || 0) + 1;
            this.traceTripletHits.set(tripletKey, tripletCount);
            this.stats.traceTripletsObserved++;

            if (
                tripletCount >= tripletThreshold &&
                canCompileRegion
            ) {
                const accepted = this.queueCompileRequest(toRegion, {
                    reason: 'trace-hot-triplet',
                    requestedTier: 'baseline',
                    confidence: 0.95,
                    source: 'triplet',
                });
                if (accepted) {
                    this.stats.traceTripletCompilesTriggered++;
                    scheduledCompile = true;
                }
            }
        }

        if (
            !scheduledCompile &&
            count >= edgeThreshold &&
            canCompileRegion
        ) {
            const confidence = Math.min(0.9, 0.4 + (count / Math.max(1, edgeThreshold)) * 0.2);
            const accepted = this.queueCompileRequest(toRegion, {
                reason: 'trace-hot-edge',
                requestedTier: 'baseline',
                confidence,
                source: 'edge',
            });
            if (accepted) {
                this.stats.traceCompilesTriggered++;
            }
        }

        // Weighted Markov predictor chooses top likely next region(s) after `to`.
        if (this.markovEnabled) {
            this.scheduleMarkovPredictions(fromRegion, toRegion, prevEdge ? prevEdge.from : null);
        }
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
        if (this.isInCooldown(regionStart)) {
            this.stats.cooldownDeferrals++;
            return;
        }
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
                this.registerCompileFailure(regionStart, e && e.message ? e.message : e);
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
                this.registerCompileFailure(regionStart, 'compiled JIT module missing run export');
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
            this.clearCompileFailure(regionStart);
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
        } catch (e) {
            this.registerCompileFailure(regionStart, e && e.message ? e.message : e);
            throw e;
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
            this.pruneRegionState(regionBase);
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

    pruneRegionState(regionBase) {
        this.regionHitCounts.delete(regionBase);
        this.regionMissDemandCounts.delete(regionBase);
        this.predictedRegions.delete(regionBase);

        // Remove queued tasks targeting this region.
        const beforeQueue = this.compileQueue.length;
        this.compileQueue = this.compileQueue.filter((task) => task.regionBase !== regionBase);
        if (this.compileQueue.length !== beforeQueue) {
            this.stats.stalePrunes += beforeQueue - this.compileQueue.length;
        }

        // Remove edge traces touching this region.
        const regionHex = regionBase.toString(16);
        for (const key of [...this.traceEdgeHits.keys()]) {
            const [a, b] = key.split(':');
            if (a === regionHex || b === regionHex) {
                this.traceEdgeHits.delete(key);
                this.stats.stalePrunes++;
            }
        }
        for (const key of [...this.traceTripletHits.keys()]) {
            const [a, b, c] = key.split(':');
            if (a === regionHex || b === regionHex || c === regionHex) {
                this.traceTripletHits.delete(key);
                this.stats.stalePrunes++;
            }
        }

        // Remove Markov first-order rows and incoming edges.
        this.markovTransitions.delete(regionBase);
        this.markovTotals.delete(regionBase);
        for (const [fromRegion, toMap] of this.markovTransitions.entries()) {
            const removed = toMap.get(regionBase) || 0;
            if (toMap.delete(regionBase)) {
                const total = Math.max(0, (this.markovTotals.get(fromRegion) || 0) - removed);
                this.markovTotals.set(fromRegion, total);
                this.stats.stalePrunes++;
            }
            if (toMap.size === 0) {
                this.markovTransitions.delete(fromRegion);
                this.markovTotals.delete(fromRegion);
            }
        }

        // Remove Markov second-order contexts touching the region.
        for (const key of [...this.markovContextTransitions.keys()]) {
            const [a, b] = key.split(':');
            if (a === regionHex || b === regionHex) {
                this.markovContextTransitions.delete(key);
                this.markovContextTotals.delete(key);
                this.stats.stalePrunes++;
                continue;
            }
            const toMap = this.markovContextTransitions.get(key);
            if (!toMap) continue;
            const removed = toMap.get(regionBase) || 0;
            if (toMap.delete(regionBase)) {
                const total = Math.max(0, (this.markovContextTotals.get(key) || 0) - removed);
                this.markovContextTotals.set(key, total);
                this.stats.stalePrunes++;
            }
            if (toMap.size === 0) {
                this.markovContextTransitions.delete(key);
                this.markovContextTotals.delete(key);
            }
        }

        if (
            this.lastTraceEdge &&
            (this.lastTraceEdge.from === regionBase || this.lastTraceEdge.to === regionBase)
        ) {
            this.lastTraceEdge = null;
        }
    }

    /**
     * Get JIT statistics for display.
     */
    getStats() {
        const missRate = this.getMissRate();
        const predictorAttempts = this.stats.predictorHits + this.stats.predictorMisses;
        const predictorHitRate = predictorAttempts > 0
            ? this.stats.predictorHits / predictorAttempts
            : 0;
        const adaptive = this.getAdaptiveThresholds();
        return {
            ...this.stats,
            compiledRegionCount: this.compiledRegions.size,
            hotPages: this.pageHitCounts.size,
            dirtyPages: this.dirtyPages.size,
            queueDepth: this.compileQueue.length,
            queuePressure: this.getQueuePressure(),
            activeCompileCount: this.activeCompileCount,
            compileBudgetPerSecond: this.compileBudgetPerSecond,
            compileTokens: this.compileTokens,
            missRate,
            predictorHitRate,
            predictorAttempts,
            adaptiveConfidenceThreshold: adaptive.confidenceThreshold,
            adaptiveEdgeThreshold: adaptive.edgeThreshold,
            adaptiveTripletThreshold: adaptive.tripletThreshold,
            traceEdgesTracked: this.traceEdgeHits.size,
            traceTripletsTracked: this.traceTripletHits.size,
            markovSourcesTracked: this.markovTransitions.size,
            markovContextsTracked: this.markovContextTransitions.size,
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
        this.regionMissDemandCounts.clear();
        this.dirtyPages.clear();
        this.compileFailureState.clear();
        this.compileQueue = [];
        this.activeCompileCount = 0;
        this.compileTokens = this.compileBudgetPerSecond;
        this.lastBudgetRefillMs = performance.now();
        this.traceEdgeHits.clear();
        this.traceTripletHits.clear();
        this.markovTransitions.clear();
        this.markovTotals.clear();
        this.markovContextTransitions.clear();
        this.markovContextTotals.clear();
        this.lastTraceEdge = null;
        this.predictedRegions.clear();
        this.steadyStateReached = false;
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
            traceTripletsObserved: 0,
            traceTripletCompilesTriggered: 0,
            markovPredictionsEvaluated: 0,
            markovPredictionsAccepted: 0,
            predictorHits: 0,
            predictorMisses: 0,
            compileQueueEnqueued: 0,
            compileQueueDropped: 0,
            compileQueuePeak: 0,
            compileFailures: 0,
            cooldownDeferrals: 0,
            stalePrunes: 0,
            missesBeforeSteady: -1,
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
