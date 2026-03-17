// V8 Boot Tracer for Emscripten
//
// Run d8.wasm with this wrapper to capture every platform call V8 makes
// during initialization. This reveals ALL the stubs we need in one shot,
// instead of discovering them one crash at a time.
//
// Usage:
//   node --experimental-wasm-memory64 trace-v8-boot.js
//
// Or in browser: load this before d8.js

// ============================================================================
// Strategy: Intercept at three levels
// ============================================================================
//
// Level 1: Emscripten syscall tracing (-sSYSCALL_DEBUG=1 at link time)
//   Shows: mmap, mprotect, munmap, brk, futex, clone3, etc.
//   Compile with: em++ ... -sASSERTIONS=2 -sSYSCALL_DEBUG=1
//
// Level 2: JavaScript-side interception (this file)
//   Shows: Which JS APIs V8's platform layer calls
//
// Level 3: Wasm import tracing
//   Shows: Every host function the Wasm module calls

const fs = require('fs');

// Collect all platform calls
const trace = [];
let traceEnabled = true;

function logCall(category, name, args, result) {
    if (!traceEnabled) return;
    trace.push({
        time: Date.now(),
        category,
        name,
        args: args ? JSON.stringify(args).substring(0, 200) : '',
        result: result !== undefined ? String(result).substring(0, 100) : ''
    });
}

// ============================================================================
// Level 2: Wrap Emscripten's syscall implementations
// ============================================================================

function wrapModule(Module) {
    // Memory operations
    const origMmap = Module._mmap;
    const origMunmap = Module._munmap;
    const origMprotect = Module._mprotect;
    const origMadvise = Module._madvise;

    if (origMmap) {
        Module._mmap = function(addr, length, prot, flags, fd, offset) {
            const result = origMmap.apply(this, arguments);
            logCall('memory', 'mmap', {
                addr: '0x' + (addr >>> 0).toString(16),
                length,
                prot,
                flags: '0x' + flags.toString(16),
                fd
            }, '0x' + (result >>> 0).toString(16));

            // Check alignment
            if (result !== -1 && (result % 65536) !== 0) {
                logCall('WARNING', 'mmap-unaligned', {
                    returned: '0x' + (result >>> 0).toString(16),
                    alignment: result % 65536
                });
            }
            return result;
        };
    }

    if (origMunmap) {
        Module._munmap = function(addr, length) {
            logCall('memory', 'munmap', {
                addr: '0x' + (addr >>> 0).toString(16),
                length
            });
            return origMunmap.apply(this, arguments);
        };
    }

    if (origMprotect) {
        Module._mprotect = function(addr, len, prot) {
            logCall('memory', 'mprotect', {
                addr: '0x' + (addr >>> 0).toString(16),
                len,
                prot
            });
            return origMprotect.apply(this, arguments);
        };
    }

    // Thread operations
    const origPthreadCreate = Module._pthread_create;
    if (origPthreadCreate) {
        Module._pthread_create = function() {
            logCall('thread', 'pthread_create', {});
            return origPthreadCreate.apply(this, arguments);
        };
    }

    // Signal operations (should all be no-ops)
    ['sigaction', 'sigaltstack', 'signal'].forEach(name => {
        const orig = Module['_' + name];
        if (orig) {
            Module['_' + name] = function() {
                logCall('signal', name, Array.from(arguments));
                return orig.apply(this, arguments);
            };
        }
    });

    return Module;
}

// ============================================================================
// Level 3: Wasm import tracing
// ============================================================================

function createTracingImports(originalImports) {
    const traced = {};
    for (const [moduleName, moduleImports] of Object.entries(originalImports)) {
        traced[moduleName] = {};
        for (const [name, impl] of Object.entries(moduleImports)) {
            if (typeof impl === 'function') {
                traced[moduleName][name] = function() {
                    logCall('wasm-import', `${moduleName}.${name}`,
                            Array.from(arguments).slice(0, 4));
                    return impl.apply(this, arguments);
                };
            } else {
                traced[moduleName][name] = impl;
            }
        }
    }
    return traced;
}

// ============================================================================
// Report generator
// ============================================================================

function generateReport() {
    traceEnabled = false;

    console.error('\n========================================');
    console.error('  V8 Boot Trace Report');
    console.error('========================================\n');

    // Group by category
    const categories = {};
    for (const entry of trace) {
        if (!categories[entry.category]) categories[entry.category] = [];
        categories[entry.category].push(entry);
    }

    for (const [cat, entries] of Object.entries(categories)) {
        console.error(`\n--- ${cat} (${entries.length} calls) ---`);

        // Count unique function names
        const counts = {};
        for (const e of entries) {
            counts[e.name] = (counts[e.name] || 0) + 1;
        }

        for (const [name, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
            console.error(`  ${name}: ${count} calls`);
        }
    }

    // Warnings
    const warnings = trace.filter(t => t.category === 'WARNING');
    if (warnings.length > 0) {
        console.error('\n--- WARNINGS ---');
        for (const w of warnings) {
            console.error(`  ${w.name}: ${w.args}`);
        }
    }

    console.error(`\nTotal platform calls: ${trace.length}`);
    console.error('Full trace saved to: /tmp/v8-boot-trace.json');

    try {
        fs.writeFileSync('/tmp/v8-boot-trace.json', JSON.stringify(trace, null, 2));
    } catch (e) {
        // May fail in browser context
    }
}

// ============================================================================
// Boot sequence
// ============================================================================

async function main() {
    console.error('[trace] Loading d8.wasm...');

    // Try to load the Emscripten-generated module
    try {
        const d8Factory = require('/tmp/d8.js');
        const Module = await d8Factory({
            // Intercept instantiation to trace imports
            instantiateWasm: function(imports, successCallback) {
                const tracedImports = createTracingImports(imports);
                const wasmBinary = fs.readFileSync('/tmp/d8.wasm');
                WebAssembly.instantiate(wasmBinary, tracedImports)
                    .then(result => {
                        successCallback(result.instance, result.module);
                    });
                return {};
            },
            onRuntimeInitialized: function() {
                console.error('[trace] Runtime initialized — generating report');
                generateReport();
            },
            onAbort: function(what) {
                console.error('[trace] ABORT: ' + what);
                generateReport();
            },
            print: function(text) { console.log(text); },
            printErr: function(text) {
                // Capture V8's DCHECK/CHECK messages
                if (text.includes('Check failed') || text.includes('Fatal error')) {
                    logCall('V8-FATAL', text, {});
                }
                console.error(text);
            }
        });

        wrapModule(Module);

    } catch (e) {
        console.error('[trace] Module load failed:', e.message);
        generateReport();
    }
}

main().catch(e => {
    console.error('[trace] Fatal:', e);
    generateReport();
});
