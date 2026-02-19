// jit_manager.js - Runtime JIT compilation manager for friscy

class JITManager {
    constructor() {
        this.compiledRegions = new Map();
        this.compilingRegions = new Set();
        this.pageHitCounts = new Map();
        this.regionHitCounts = new Map();
        this.hotThreshold = 50;
        this.optimizeThreshold = 200;
        this.tieringEnabled = true;
        this.traceEnabled = true;
        this.tripletEnabled = true;
        this.markovEnabled = true;
        this.traceEdgeHotThreshold = 8;
        this.traceTripletHotThreshold = 6;
        this.traceMaxEdges = 4096;
        this.traceMaxTriplets = 8192;
        this.traceEdgeHits = new Map();
        this.traceTripletHits = new Map();
        this.lastTraceEdge = null;
        this.markovTransitions = new Map();
        this.markovTotals = new Map();
        this.markovContextTransitions = new Map();
        this.markovContextTotals = new Map();
        this.regionSize = 16384;
        this.pageSize = 4096;
        this.jitCompiler = null;
        this.jitCompilerLoading = null;
        this.wasmMemory = null;
        this.regionMissDemandCounts = new Map();
        this.compileFailureState = new Map();
        this.failureBaseCooldownMs = 2000;
        this.failureMaxCooldownMs = 120000;
        this.compileQueue = [];
        this.compileQueueMax = 128;
        this.compileBudgetPerSecond = 6;
        this.maxConcurrentCompiles = 1;
        this.activeCompileCount = 0;
        this.compileTokens = this.compileBudgetPerSecond;
        this.lastBudgetRefillMs = performance.now();
        this.schedulerIntervalMs = 100;
        this.schedulerTimer = null;
        this.predictorTopK = 2;
        this.predictorBaseConfidenceThreshold = 0.55;
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
            missesBeforeSteady: 0,
        };
        this.predictedRegions = new Map();
        this.steadyStateReached = false;
        this.dirtyPages = new Set();
    }

    init(wasmMemory) {
        this.wasmMemory = wasmMemory;
        this.ensureSchedulerRunning();
    }

    configureTiering({ enabled, optimizeThreshold } = {}) {
        if (typeof enabled === 'boolean') this.tieringEnabled = enabled;
        if (Number.isInteger(optimizeThreshold) && optimizeThreshold > 0) this.optimizeThreshold = optimizeThreshold;
    }

    configureTrace({ enabled, edgeHotThreshold, tripletHotThreshold } = {}) {
        if (typeof enabled === 'boolean') {
            this.traceEnabled = enabled;
            if (!enabled) this.lastTraceEdge = null;
        }
        if (Number.isInteger(edgeHotThreshold) && edgeHotThreshold > 0) this.traceEdgeHotThreshold = edgeHotThreshold;
        if (Number.isInteger(tripletHotThreshold) && tripletHotThreshold > 0) this.traceTripletHotThreshold = tripletHotThreshold;
    }

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
        if (Number.isInteger(maxConcurrentCompiles) && maxConcurrentCompiles > 0) this.maxConcurrentCompiles = maxConcurrentCompiles;
        if (Number.isInteger(compileQueueMax) && compileQueueMax > 8) this.compileQueueMax = compileQueueMax;
        if (Number.isInteger(predictorTopK) && predictorTopK > 0) this.predictorTopK = predictorTopK;
        if (Number.isFinite(predictorBaseConfidenceThreshold)) {
            this.predictorBaseConfidenceThreshold = Math.min(0.95, Math.max(0.1, predictorBaseConfidenceThreshold));
        }
    }

    configurePredictor({ markovEnabled, tripletEnabled } = {}) {
        if (typeof markovEnabled === 'boolean') this.markovEnabled = markovEnabled;
        if (typeof tripletEnabled === 'boolean') this.tripletEnabled = tripletEnabled;
    }

    async loadCompiler(url = 'rv2wasm_jit_bg.wasm') {
        if (this.jitCompiler) return;
        if (this.jitCompilerLoading) return this.jitCompilerLoading;

        this.jitCompilerLoading = (async () => {
            try {
                const { default: init, compile_region, compile_region_fast, compile_region_optimized, version } = await import('./rv2wasm_jit.js');
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
            } catch (e) {
                console.warn('[JIT] Failed to load compiler:', e.message);
                this.jitCompiler = null;
            }
        })();
        return this.jitCompilerLoading;
    }

    ensureSchedulerRunning() {
        if (this.schedulerTimer !== null) return;
        this.schedulerTimer = setInterval(() => { this.processCompileQueue(); }, this.schedulerIntervalMs);
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
        const confidenceThreshold = Math.min(0.95, Math.max(0.15, this.predictorBaseConfidenceThreshold + queuePressure * 0.25 - Math.min(0.5, missRate) * 0.2));
        const scale = Math.min(2.0, Math.max(0.5, 1 + queuePressure * 0.8 - Math.min(0.6, missRate) * 0.5));
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
        return state ? nowMs < state.cooldownUntilMs : false;
    }

    registerCompileFailure(regionBase, error) {
        const nowMs = performance.now();
        const prev = this.compileFailureState.get(regionBase);
        const count = (prev?.count || 0) + 1;
        const cooldown = Math.min(this.failureMaxCooldownMs, this.failureBaseCooldownMs * Math.pow(2, Math.min(7, count - 1)));
        this.compileFailureState.set(regionBase, { count, cooldownUntilMs: nowMs + cooldown, lastFailMs: nowMs, lastError: error ? String(error) : 'unknown' });
        this.stats.compileFailures++;
    }

    clearCompileFailure(regionBase) { this.compileFailureState.delete(regionBase); }

    queueCompileRequest(regionBase, { reason = 'manual', requestedTier = 'baseline', confidence = 1.0, source = 'direct', missCost = null, markPredicted = false } = {}) {
        const nowMs = performance.now();
        if (!Number.isFinite(regionBase) || !this.jitCompiler || !this.wasmMemory) return false;
        const alignedRegion = (regionBase >>> 0) & ~(this.regionSize - 1);
        const existing = this.compiledRegions.get(alignedRegion);
        if (existing?.tier === 'optimized') return false;
        if (existing && requestedTier !== 'optimized') return false;
        if (this.compilingRegions.has(alignedRegion) || this.isInCooldown(alignedRegion, nowMs)) return false;
        const effectiveMissCost = missCost ?? this.computeMissCost(alignedRegion);
        const priority = Math.max(0.001, Math.min(1, confidence)) * effectiveMissCost;
        const existingIdx = this.compileQueue.findIndex(t => t.regionBase === alignedRegion);
        if (existingIdx >= 0) {
            if (this.compileQueue[existingIdx].priority >= priority) return false;
            this.compileQueue.splice(existingIdx, 1);
        } else if (this.compileQueue.length >= this.compileQueueMax) {
            this.compileQueue.sort((a, b) => a.priority - b.priority);
            if (this.compileQueue[0].priority >= priority) return false;
            this.compileQueue.shift();
        }
        this.compileQueue.push({ regionBase: alignedRegion, reason, requestedTier, confidence, missCost: effectiveMissCost, priority, source, enqueuedAtMs: nowMs, markPredicted });
        this.compileQueue.sort((a, b) => b.priority !== a.priority ? b.priority - a.priority : a.enqueuedAtMs - b.enqueuedAtMs);
        if (markPredicted) this.predictedRegions.set(alignedRegion, { atMs: nowMs, used: false });
        this.ensureSchedulerRunning();
        return true;
    }

    async processCompileQueue() {
        if (!this.jitCompiler || !this.wasmMemory) return;
        this.refillCompileTokens();
        while (this.compileQueue.length > 0 && this.activeCompileCount < this.maxConcurrentCompiles && this.compileTokens >= 1) {
            const task = this.compileQueue.shift();
            if (!task) break;
            if (this.isInCooldown(task.regionBase)) continue;
            this.compileTokens -= 1; this.activeCompileCount++;
            this.compileRegion(task.regionBase, task.reason, task.requestedTier).catch(() => {}).finally(() => {
                this.activeCompileCount = Math.max(0, this.activeCompileCount - 1);
                if (!this.steadyStateReached && this.compileQueue.length === 0 && this.activeCompileCount === 0) {
                    this.steadyStateReached = true; this.stats.missesBeforeSteady = this.stats.regionMisses;
                }
            });
        }
    }

    recordMarkovTransition(fromRegion, toRegion) {
        let toMap = this.markovTransitions.get(fromRegion);
        if (!toMap) { toMap = new Map(); this.markovTransitions.set(fromRegion, toMap); }
        toMap.set(toRegion, (toMap.get(toRegion) || 0) + 1);
        this.markovTotals.set(fromRegion, (this.markovTotals.get(fromRegion) || 0) + 1);
    }

    recordMarkovContextTransition(contextKey, toRegion) {
        let toMap = this.markovContextTransitions.get(contextKey);
        if (!toMap) { toMap = new Map(); this.markovContextTransitions.set(contextKey, toMap); }
        toMap.set(toRegion, (toMap.get(toRegion) || 0) + 1);
        this.markovContextTotals.set(contextKey, (this.markovContextTotals.get(contextKey) || 0) + 1);
    }

    getTopPredictionsForSource(fromRegion) {
        const total = this.markovTotals.get(fromRegion) || 0;
        if (total <= 0) return [];
        const toMap = this.markovTransitions.get(fromRegion);
        return toMap ? [...toMap.entries()].map(([regionBase, count]) => ({ regionBase, confidence: count / total, source: 'markov1' })).sort((a, b) => b.confidence - a.confidence) : [];
    }

    getTopPredictionsForContext(contextKey) {
        const total = this.markovContextTotals.get(contextKey) || 0;
        if (total <= 0) return [];
        const toMap = this.markovContextTransitions.get(contextKey);
        return toMap ? [...toMap.entries()].map(([regionBase, count]) => ({ regionBase, confidence: count / total, source: 'markov2' })).sort((a, b) => b.confidence - a.confidence) : [];
    }

    scheduleMarkovPredictions(fromRegion, toRegion, prevFromRegion = null) {
        if (!this.markovEnabled || !this.traceEnabled) return;
        const { confidenceThreshold } = this.getAdaptiveThresholds();
        const firstOrder = this.getTopPredictionsForSource(toRegion);
        const contextKey = prevFromRegion !== null ? `${prevFromRegion.toString(16)}:${toRegion.toString(16)}` : null;
        const secondOrder = contextKey ? this.getTopPredictionsForContext(contextKey) : [];
        const merged = new Map();
        for (const item of firstOrder) merged.set(item.regionBase, { ...item });
        for (const item of secondOrder) {
            const boosted = Math.min(1, item.confidence * 1.1);
            const existing = merged.get(item.regionBase);
            if (!existing || boosted > existing.confidence) merged.set(item.regionBase, { ...item, confidence: boosted });
        }
        const candidates = [...merged.values()].filter(c => c.regionBase !== fromRegion && c.regionBase !== toRegion).sort((a, b) => b.confidence - a.confidence).slice(0, this.predictorTopK);
        for (const cand of candidates) {
            if (cand.confidence < confidenceThreshold) continue;
            this.queueCompileRequest(cand.regionBase, { reason: `${cand.source}-predict`, requestedTier: 'baseline', confidence: cand.confidence, source: cand.source, markPredicted: true });
        }
    }

    recordExecution(pc) {
        const upc = pc >>> 0;
        const page = upc & ~(this.pageSize - 1);
        const regionBase = upc & ~(this.regionSize - 1);
        const existing = this.compiledRegions.get(regionBase);
        if (existing) {
            this.stats.jitHits++;
            const pred = this.predictedRegions.get(regionBase);
            if (pred && !pred.used) { pred.used = true; this.stats.predictorHits++; }
            const hits = (this.regionHitCounts.get(regionBase) || 0) + 1;
            this.regionHitCounts.set(regionBase, hits);
            if (this.tieringEnabled && this.jitCompiler?.supportsTiering && existing.tier !== 'optimized' && hits >= this.optimizeThreshold && !this.compilingRegions.has(regionBase)) {
                this.queueCompileRequest(regionBase, { reason: 'region-hot-promote', requestedTier: 'optimized', source: 'tiering' });
            }
            return true;
        }
        const pred = this.predictedRegions.get(regionBase);
        if (pred && !pred.used) { this.stats.predictorMisses++; this.predictedRegions.delete(regionBase); }
        this.regionMissDemandCounts.set(regionBase, (this.regionMissDemandCounts.get(regionBase) || 0) + 1);
        const count = (this.pageHitCounts.get(page) || 0) + 1;
        this.pageHitCounts.set(page, count);
        if (count >= this.hotThreshold && this.jitCompiler && !this.compilingRegions.has(regionBase)) {
            this.queueCompileRequest(regionBase, { reason: 'page-hot', requestedTier: 'baseline', source: 'page-hot' });
        }
        this.stats.jitMisses++;
        return false;
    }

    recordTraceTransition(fromPc, toPc) {
        if (!this.traceEnabled) return;
        const fromRegion = (fromPc >>> 0) & ~(this.regionSize - 1);
        const toRegion = (toPc >>> 0) & ~(this.regionSize - 1);
        if (fromRegion === toRegion) return;
        const prevEdge = this.lastTraceEdge;
        this.lastTraceEdge = { from: fromRegion, to: toRegion };
        const { edgeThreshold, tripletThreshold } = this.getAdaptiveThresholds();
        const key = `${fromRegion.toString(16)}:${toRegion.toString(16)}`;
        if (!this.traceEdgeHits.has(key) && this.traceEdgeHits.size >= this.traceMaxEdges) this.traceEdgeHits.delete(this.traceEdgeHits.keys().next().value);
        const count = (this.traceEdgeHits.get(key) || 0) + 1;
        this.traceEdgeHits.set(key, count);
        this.stats.traceEdgesObserved++;
        this.recordMarkovTransition(fromRegion, toRegion);
        if (prevEdge?.to === fromRegion) {
            this.recordMarkovContextTransition(`${prevEdge.from.toString(16)}:${fromRegion.toString(16)}`, toRegion);
            if (this.tripletEnabled) {
                const tripletKey = `${prevEdge.from.toString(16)}:${fromRegion.toString(16)}:${toRegion.toString(16)}`;
                if (!this.traceTripletHits.has(tripletKey) && this.traceTripletHits.size >= this.traceMaxTriplets) this.traceTripletHits.delete(this.traceTripletHits.keys().next().value);
                const tCount = (this.traceTripletHits.get(tripletKey) || 0) + 1;
                this.traceTripletHits.set(tripletKey, tCount);
                this.stats.traceTripletsObserved++;
                if (tCount >= tripletThreshold && this.jitCompiler) {
                    if (this.queueCompileRequest(toRegion, { reason: 'trace-hot-triplet', source: 'triplet' })) return;
                }
            }
        }
        if (count >= edgeThreshold && this.jitCompiler) this.queueCompileRequest(toRegion, { reason: 'trace-hot-edge', confidence: 0.4 + (count / edgeThreshold) * 0.2, source: 'edge' });
        if (this.markovEnabled) this.scheduleMarkovPredictions(fromRegion, toRegion, prevEdge?.from);
    }

    getCompiledRegion(pc) {
        const regionBase = (pc >>> 0) & ~(this.regionSize - 1);
        const entry = this.compiledRegions.get(regionBase);
        if (!entry) return null;
        for (let page = entry.regionStart; page < entry.regionEnd; page += this.pageSize) {
            if (this.dirtyPages.has(page >>> 0)) { this.invalidatePage(page >>> 0); return null; }
        }
        return entry;
    }

    execute(pc, machineStatePtr) {
        const region = this.getCompiledRegion(pc);
        if (!region) return null;
        this.stats.dispatchCalls++;
        const value = region.run(machineStatePtr, pc >>> 0) >>> 0;
        if (value === 0xFFFFFFFF) return { nextPC: 0, isSyscall: false, isHalt: true };
        if ((value & 0x80000000) !== 0) return { nextPC: value & 0x7FFFFFFF, isSyscall: true, isHalt: false };
        this.stats.regionMisses++;
        return { nextPC: value, isSyscall: false, isHalt: false, regionMiss: true };
    }

    async compileRegion(pageAddr, _reason = 'manual', requestedTier = 'baseline') {
        if (!this.jitCompiler || !this.wasmMemory) return;
        const start = (pageAddr >>> 0) & ~(this.regionSize - 1);
        if (this.isInCooldown(start)) return;
        const existing = this.compiledRegions.get(start);
        if (existing?.tier === 'optimized' || (existing && requestedTier !== 'optimized') || this.compilingRegions.has(start)) return;
        this.compilingRegions.add(start);
        const startTime = performance.now();
        try {
            const buf = new Uint8Array(this.wasmMemory.buffer);
            const end = Math.min(start + this.regionSize, buf.length);
            let compileFn = null, tier = requestedTier;
            if (tier === 'optimized' && this.jitCompiler.compile_region_optimized && this.tieringEnabled) compileFn = this.jitCompiler.compile_region_optimized;
            else if (tier === 'baseline' && this.jitCompiler.compile_region_fast) compileFn = this.jitCompiler.compile_region_fast;
            else if (this.jitCompiler.compile_region) { compileFn = this.jitCompiler.compile_region; tier = 'compat'; }
            if (!compileFn) return;
            const wasmBytes = compileFn(buf.slice(start, end), start);
            const { instance } = await WebAssembly.instantiate(wasmBytes, { env: { memory: this.wasmMemory } });
            if (typeof instance.exports.run !== 'function') throw new Error('missing run export');
            this.compiledRegions.set(start, { run: instance.exports.run, instance, regionStart: start, regionEnd: end, tier });
            this.stats.regionsCompiled++; this.stats.compilationTimeMs += (performance.now() - startTime);
            this.clearCompileFailure(start);
            if (tier === 'optimized') { this.stats.optimizedCompiles++; if (existing?.tier !== 'optimized') this.stats.promotedRegions++; }
            else this.stats.baselineCompiles++;
        } catch (e) { this.registerCompileFailure(start, e.message); throw e; } finally { this.compilingRegions.delete(start); }
    }

    markPageDirty(pageAddr) { this.dirtyPages.add(pageAddr & ~(this.pageSize - 1)); }

    invalidatePage(pageAddr) {
        const page = pageAddr & ~(this.pageSize - 1);
        const toDelete = [];
        for (const [base, entry] of this.compiledRegions) if (page >= entry.regionStart && page < entry.regionEnd) toDelete.push(base);
        for (const base of toDelete) { this.compiledRegions.delete(base); this.pruneRegionState(base); }
        this.dirtyPages.delete(page); this.pageHitCounts.delete(page);
        this.regionHitCounts.delete(page & ~(this.regionSize - 1));
    }

    pruneRegionState(regionBase) {
        this.regionHitCounts.delete(regionBase); this.regionMissDemandCounts.delete(regionBase); this.predictedRegions.delete(regionBase);
        this.compileQueue = this.compileQueue.filter(t => t.regionBase !== regionBase);
        const hex = regionBase.toString(16);
        for (const k of [...this.traceEdgeHits.keys()]) if (k.startsWith(hex + ':') || k.endsWith(':' + hex)) this.traceEdgeHits.delete(k);
        for (const k of [...this.traceTripletHits.keys()]) { const parts = k.split(':'); if (parts.includes(hex)) this.traceTripletHits.delete(k); }
        this.markovTransitions.delete(regionBase); this.markovTotals.delete(regionBase);
        for (const [from, toMap] of this.markovTransitions.entries()) {
            if (toMap.delete(regionBase)) this.markovTotals.set(from, Math.max(0, (this.markovTotals.get(from) || 0) - 1));
            if (toMap.size === 0) { this.markovTransitions.delete(from); this.markovTotals.delete(from); }
        }
        for (const k of [...this.markovContextTransitions.keys()]) {
            if (k.split(':').includes(hex)) { this.markovContextTransitions.delete(k); this.markovContextTotals.delete(k); continue; }
            const toMap = this.markovContextTransitions.get(k);
            if (toMap?.delete(regionBase)) {
                this.markovContextTotals.set(k, Math.max(0, (this.markovContextTotals.get(k) || 0) - 1));
                if (toMap.size === 0) { this.markovContextTransitions.delete(k); this.markovContextTotals.delete(k); }
            }
        }
        if (this.lastTraceEdge?.from === regionBase || this.lastTraceEdge?.to === regionBase) this.lastTraceEdge = null;
    }

    getStats() {
        const missRate = this.getMissRate();
        const predictorAttempts = this.stats.predictorHits + this.stats.predictorMisses;
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
            predictorHitRate: predictorAttempts > 0 ? this.stats.predictorHits / predictorAttempts : 0,
            predictorAttempts,
        };
    }

    reset() {
        this.compiledRegions.clear(); this.compilingRegions.clear(); this.pageHitCounts.clear(); this.regionHitCounts.clear();
        this.regionMissDemandCounts.clear(); this.dirtyPages.clear(); this.compileFailureState.clear(); this.compileQueue = [];
        this.activeCompileCount = 0; this.compileTokens = this.compileBudgetPerSecond; this.lastBudgetRefillMs = performance.now();
        this.traceEdgeHits.clear(); this.traceTripletHits.clear(); this.markovTransitions.clear(); this.markovTotals.clear();
        this.markovContextTransitions.clear(); this.markovContextTotals.clear(); this.lastTraceEdge = null;
        this.predictedRegions.clear(); this.steadyStateReached = false;
        this.stats = {
            regionsCompiled: 0, baselineCompiles: 0, optimizedCompiles: 0, promotedRegions: 0, jitHits: 0, jitMisses: 0, compilationTimeMs: 0,
            dispatchCalls: 0, regionMisses: 0, traceEdgesObserved: 0, traceCompilesTriggered: 0, traceTripletsObserved: 0, traceTripletCompilesTriggered: 0,
            markovPredictionsEvaluated: 0, markovPredictionsAccepted: 0, predictorHits: 0, predictorMisses: 0, compileQueueEnqueued: 0,
            compileQueueDropped: 0, compileQueuePeak: 0, compileFailures: 0, cooldownDeferrals: 0, stalePrunes: 0, missesBeforeSteady: 0,
        };
    }
}

const jitManager = new JITManager();
export function installInvalidationHook(Module) {
    Module._jitInvalidateRange = function(addr, len) {
        const pageSize = jitManager.pageSize;
        const startPage = (addr & ~(pageSize - 1)) >>> 0;
        const endAddr = (addr + len) >>> 0;
        for (let page = startPage; page < endAddr; page = (page + pageSize) >>> 0) jitManager.markPageDirty(page);
    };
}
export default jitManager;
