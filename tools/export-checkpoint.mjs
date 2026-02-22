#!/usr/bin/env node
// export-checkpoint.mjs — Export claude-repl checkpoint via Wasm runtime
//
// Uses the Emscripten friscy (which has JSPI handlers for vh_preload) to run
// Node + claude-repl until stdin wait, then saves checkpoint. Native friscy
// cannot export with LD_PRELOAD because vh_preload needs the JS layer.
//
// Usage: node tools/export-checkpoint.mjs [--out path]
// Default output: friscy-bundle/claude-repl.ckpt
//
// Takes ~20–30 minutes (340M RISC-V instructions emulated).

import { createRequire } from 'module';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT = resolve(__dirname, '..');
const BUNDLE = resolve(PROJECT, 'friscy-bundle');

let outPath = resolve(BUNDLE, 'claude-repl.ckpt');
const args = process.argv.slice(2);
if (args[0] === '--out' && args[1]) {
  outPath = resolve(args[1]);
  args.splice(0, 2);
}

console.log('[export-checkpoint] Loading Wasm friscy...');
const createModule = (await import(resolve(BUNDLE, 'friscy.js'))).default;

const rootfs = readFileSync(resolve(BUNDLE, 'claude-slim-snap.tar'));

const mod = await createModule({
  noInitialRun: true,
  print: (t) => process.stdout.write(t + '\n'),
  printErr: (t) => process.stderr.write(t + '\n'),
});

mod.FS.writeFile('/rootfs.tar', new Uint8Array(rootfs));

const friscyArgs = [
  '--rootfs', '/rootfs.tar',
  '--env', 'LD_PRELOAD=/usr/lib/vh_preload.so',
  '--env', 'ANTHROPIC_API_KEY=sk-ant-dummy',
  '--export-checkpoint', '/export.ckpt',
  '/usr/bin/node', '--jitless', '--max-old-space-size=256', '/usr/local/bin/claude-repl.js',
];

console.log('[export-checkpoint] Starting export (this may take 20–30 minutes)...');
const t0 = Date.now();

await mod.callMain(friscyArgs);

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`[export-checkpoint] callMain returned after ${elapsed}s`);

try {
  const data = mod.FS.readFile('/export.ckpt');
  writeFileSync(outPath, new Uint8Array(data));
  console.log(`[export-checkpoint] Written ${(data.length / 1048576).toFixed(1)} MB to ${outPath}`);
} catch (e) {
  console.error('[export-checkpoint] Failed to read checkpoint from VFS:', e.message);
  process.exit(1);
}
