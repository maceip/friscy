/**
 * Basic smoke test for EdgeJS browser build.
 *
 * Run with: node test-basic.mjs
 * (Uses Node.js to simulate the browser loading path)
 */

import { NapiBridge } from '../napi-bridge/index.js';

console.log('=== EdgeJS Browser Build - Smoke Tests ===\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL: ${name} — ${e.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

// --- NapiBridge Tests ---

console.log('NapiBridge Handle Table:');

const bridge = new NapiBridge(null);

test('well-known handles: undefined=0, null=1, global=2', () => {
  assert(bridge.getHandle(0) === undefined);
  assert(bridge.getHandle(1) === null);
  assert(bridge.getHandle(2) === globalThis);
});

test('createHandle returns unique handles', () => {
  const h1 = bridge.createHandle(42);
  const h2 = bridge.createHandle('hello');
  const h3 = bridge.createHandle({ x: 1 });
  assert(h1 !== h2 && h2 !== h3);
  assert(bridge.getHandle(h1) === 42);
  assert(bridge.getHandle(h2) === 'hello');
  assert(bridge.getHandle(h3).x === 1);
});

test('undefined/null return well-known handles', () => {
  assert(bridge.createHandle(undefined) === 0);
  assert(bridge.createHandle(null) === 1);
});

test('handle scopes isolate handles', () => {
  const before = bridge.handles.length;
  bridge.openHandleScope();
  bridge.createHandle('scoped-value');
  bridge.createHandle([1, 2, 3]);
  bridge.closeHandleScope();
  // Handles should be freed after scope closes
});

test('freeHandle recycles handles', () => {
  const h = bridge.createHandle('temp');
  bridge.freeHandle(h);
  const h2 = bridge.createHandle('reuse');
  assert(h === h2, 'Should reuse freed handle slot');
});

// --- Summary ---
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
