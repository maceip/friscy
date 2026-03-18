/**
 * Extended N-API bridge tests.
 *
 * Tests the full N-API import object generation, type checking,
 * property access, function calls, and error handling.
 *
 * Run: node tests/test-napi-bridge.mjs
 */

import { NapiBridge } from '../napi-bridge/index.js';

console.log('=== N-API Bridge Extended Tests ===\n');

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

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

function assertEq(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${b}, got ${a}`);
}

// ---- Setup ----
const bridge = new NapiBridge(null);

// Simulate Wasm memory (4KB buffer)
const memoryBuffer = new ArrayBuffer(4096);
bridge.memory = { buffer: memoryBuffer };

// ---- Import Object Tests ----
console.log('Import Object Generation:');
const imports = bridge.getImports();

test('getImports returns object with N-API functions', () => {
  assert(typeof imports === 'object');
  assert(typeof imports.napi_create_int32 === 'function');
  assert(typeof imports.napi_create_string_utf8 === 'function');
  assert(typeof imports.napi_create_object === 'function');
  assert(typeof imports.napi_get_global === 'function');
  assert(typeof imports.napi_typeof === 'function');
  assert(typeof imports.napi_call_function === 'function');
});

// ---- Value Creation via Imports ----
console.log('\nValue Creation:');

test('napi_create_int32 creates handle for integer', () => {
  const resultPtr = 100; // offset in memory
  const status = imports.napi_create_int32(0, 42, resultPtr);
  assertEq(status, 0, 'should return NAPI_OK');
  const handle = new Int32Array(memoryBuffer, resultPtr, 1)[0];
  assertEq(bridge.getHandle(handle), 42);
});

test('napi_create_double creates handle for float', () => {
  const resultPtr = 200;
  const status = imports.napi_create_double(0, 3.14, resultPtr);
  assertEq(status, 0);
  const handle = new Int32Array(memoryBuffer, resultPtr, 1)[0];
  assertEq(bridge.getHandle(handle), 3.14);
});

test('napi_create_object creates empty object handle', () => {
  const resultPtr = 300;
  const status = imports.napi_create_object(0, resultPtr);
  assertEq(status, 0);
  const handle = new Int32Array(memoryBuffer, resultPtr, 1)[0];
  const obj = bridge.getHandle(handle);
  assert(typeof obj === 'object' && obj !== null);
  assertEq(Object.keys(obj).length, 0);
});

test('napi_create_array creates empty array handle', () => {
  const resultPtr = 400;
  const status = imports.napi_create_array(0, resultPtr);
  assertEq(status, 0);
  const handle = new Int32Array(memoryBuffer, resultPtr, 1)[0];
  const arr = bridge.getHandle(handle);
  assert(Array.isArray(arr));
  assertEq(arr.length, 0);
});

// ---- Global & Constants ----
console.log('\nGlobals & Constants:');

test('napi_get_global returns globalThis handle', () => {
  const resultPtr = 500;
  imports.napi_get_global(0, resultPtr);
  const handle = new Int32Array(memoryBuffer, resultPtr, 1)[0];
  assertEq(handle, 2);
  assertEq(bridge.getHandle(handle), globalThis);
});

test('napi_get_undefined returns handle 0', () => {
  const resultPtr = 600;
  imports.napi_get_undefined(0, resultPtr);
  const handle = new Int32Array(memoryBuffer, resultPtr, 1)[0];
  assertEq(handle, 0);
});

test('napi_get_null returns handle 1', () => {
  const resultPtr = 700;
  imports.napi_get_null(0, resultPtr);
  const handle = new Int32Array(memoryBuffer, resultPtr, 1)[0];
  assertEq(handle, 1);
});

// ---- Type Checking ----
console.log('\nType Checking:');

test('napi_typeof identifies types correctly', () => {
  const resultPtr = 800;

  // undefined (handle 0)
  imports.napi_typeof(0, 0, resultPtr);
  assertEq(new Int32Array(memoryBuffer, resultPtr, 1)[0], 0, 'undefined');

  // null (handle 1)
  imports.napi_typeof(0, 1, resultPtr);
  assertEq(new Int32Array(memoryBuffer, resultPtr, 1)[0], 1, 'null');

  // number
  const numHandle = bridge.createHandle(42);
  imports.napi_typeof(0, numHandle, resultPtr);
  assertEq(new Int32Array(memoryBuffer, resultPtr, 1)[0], 3, 'number');

  // string
  const strHandle = bridge.createHandle('hello');
  imports.napi_typeof(0, strHandle, resultPtr);
  assertEq(new Int32Array(memoryBuffer, resultPtr, 1)[0], 4, 'string');

  // function
  const fnHandle = bridge.createHandle(() => {});
  imports.napi_typeof(0, fnHandle, resultPtr);
  assertEq(new Int32Array(memoryBuffer, resultPtr, 1)[0], 7, 'function');

  // object
  const objHandle = bridge.createHandle({});
  imports.napi_typeof(0, objHandle, resultPtr);
  assertEq(new Int32Array(memoryBuffer, resultPtr, 1)[0], 6, 'object');
});

// ---- Value Getters ----
console.log('\nValue Getters:');

test('napi_get_value_int32 reads integer', () => {
  const handle = bridge.createHandle(123);
  const resultPtr = 900;
  imports.napi_get_value_int32(0, handle, resultPtr);
  assertEq(new Int32Array(memoryBuffer, resultPtr, 1)[0], 123);
});

test('napi_get_value_double reads float', () => {
  const handle = bridge.createHandle(2.718);
  const resultPtr = 1000; // 8-byte aligned for Float64
  imports.napi_get_value_double(0, handle, resultPtr);
  const val = new Float64Array(memoryBuffer, resultPtr, 1)[0];
  assert(Math.abs(val - 2.718) < 0.001);
});

test('napi_get_value_bool reads boolean', () => {
  const trueHandle = bridge.createHandle(true);
  const falseHandle = bridge.createHandle(false);
  const resultPtr = 1100;

  imports.napi_get_value_bool(0, trueHandle, resultPtr);
  assertEq(new Int32Array(memoryBuffer, resultPtr, 1)[0], 1);

  imports.napi_get_value_bool(0, falseHandle, resultPtr);
  assertEq(new Int32Array(memoryBuffer, resultPtr, 1)[0], 0);
});

// ---- String Operations ----
console.log('\nString Operations:');

test('napi_create_string_utf8 + napi_get_value_string_utf8 roundtrip', () => {
  // Write "test" into memory at offset 1200
  const encoder = new TextEncoder();
  const bytes = encoder.encode('test');
  const src = new Uint8Array(memoryBuffer, 1200, bytes.length + 1);
  src.set(bytes);
  src[bytes.length] = 0;

  // Create string handle
  const handlePtr = 1300;
  imports.napi_create_string_utf8(0, 1200, 4, handlePtr);
  const handle = new Int32Array(memoryBuffer, handlePtr, 1)[0];

  // Read back the string length
  const lenPtr = 1400;
  imports.napi_get_value_string_utf8(0, handle, 0, 0, lenPtr);
  const len = new Int32Array(memoryBuffer, lenPtr, 1)[0];
  assertEq(len, 4, 'string length');

  // Read back the string content
  const bufPtr = 1500;
  const writtenPtr = 1600;
  imports.napi_get_value_string_utf8(0, handle, bufPtr, 100, writtenPtr);
  const written = new Int32Array(memoryBuffer, writtenPtr, 1)[0];
  assertEq(written, 4);
  const result = new TextDecoder().decode(new Uint8Array(memoryBuffer, bufPtr, written));
  assertEq(result, 'test');
});

// ---- Property Access ----
console.log('\nProperty Access:');

test('napi_set/get_named_property roundtrip', () => {
  // Create object
  const objPtr = 1700;
  imports.napi_create_object(0, objPtr);
  const objHandle = new Int32Array(memoryBuffer, objPtr, 1)[0];

  // Write property name "foo" to memory
  const nameBytes = new TextEncoder().encode('foo');
  const nameView = new Uint8Array(memoryBuffer, 1800, nameBytes.length + 1);
  nameView.set(nameBytes);
  nameView[nameBytes.length] = 0;

  // Create value
  const valPtr = 1900;
  imports.napi_create_int32(0, 99, valPtr);
  const valHandle = new Int32Array(memoryBuffer, valPtr, 1)[0];

  // Set property
  imports.napi_set_named_property(0, objHandle, 1800, valHandle);

  // Get property back
  const getPtr = 2000;
  imports.napi_get_named_property(0, objHandle, 1800, getPtr);
  const gotHandle = new Int32Array(memoryBuffer, getPtr, 1)[0];
  assertEq(bridge.getHandle(gotHandle), 99);
});

test('napi_has_named_property checks existence', () => {
  const obj = { existsKey: true };
  const objHandle = bridge.createHandle(obj);

  // Write "existsKey" to memory
  const nameBytes = new TextEncoder().encode('existsKey');
  const nameView = new Uint8Array(memoryBuffer, 2100, nameBytes.length + 1);
  nameView.set(nameBytes);
  nameView[nameBytes.length] = 0;

  const resultPtr = 2200;
  imports.napi_has_named_property(0, objHandle, 2100, resultPtr);
  assertEq(new Int32Array(memoryBuffer, resultPtr, 1)[0], 1);

  // Write "missingKey"
  const missBytes = new TextEncoder().encode('missingKey');
  const missView = new Uint8Array(memoryBuffer, 2300, missBytes.length + 1);
  missView.set(missBytes);
  missView[missBytes.length] = 0;

  imports.napi_has_named_property(0, objHandle, 2300, resultPtr);
  assertEq(new Int32Array(memoryBuffer, resultPtr, 1)[0], 0);
});

// ---- Handle Scopes ----
console.log('\nHandle Scopes:');

test('napi_open/close_handle_scope manages handles', () => {
  const scopePtr = 2400;
  const status1 = imports.napi_open_handle_scope(0, scopePtr);
  assertEq(status1, 0);

  // Create handles inside scope
  bridge.createHandle('scoped1');
  bridge.createHandle('scoped2');

  const status2 = imports.napi_close_handle_scope(0, 0);
  assertEq(status2, 0);
});

// ---- References ----
console.log('\nReferences:');

test('napi_create/delete_reference manages refs', () => {
  const handle = bridge.createHandle({ persistent: true });
  const refPtr = 2500;

  const status1 = imports.napi_create_reference(0, handle, 1, refPtr);
  assertEq(status1, 0);

  // The handle should survive scope close because it's ref'd
  assert(bridge.refs.has(handle));

  const status2 = imports.napi_delete_reference(0, handle);
  assertEq(status2, 0);
  assert(!bridge.refs.has(handle));
});

// ---- Error Handling ----
console.log('\nError Handling:');

test('napi_is_exception_pending returns false by default', () => {
  const resultPtr = 2600;
  imports.napi_is_exception_pending(0, resultPtr);
  assertEq(new Int32Array(memoryBuffer, resultPtr, 1)[0], 0);
});

test('napi_throw_error does not crash', () => {
  const msgBytes = new TextEncoder().encode('test error');
  const msgView = new Uint8Array(memoryBuffer, 2700, msgBytes.length + 1);
  msgView.set(msgBytes);
  msgView[msgBytes.length] = 0;

  const status = imports.napi_throw_error(0, 0, 2700);
  assertEq(status, 0);
});

// ---- Memory Helpers ----
console.log('\nMemory Helpers:');

test('readString reads UTF-8 from buffer', () => {
  const bytes = new TextEncoder().encode('hello wasm');
  new Uint8Array(memoryBuffer, 2800, bytes.length).set(bytes);
  assertEq(bridge.readString(2800, bytes.length), 'hello wasm');
});

test('writeString writes UTF-8 to buffer', () => {
  const written = bridge.writeString(2900, 'test', 100);
  assertEq(written, 4);
  const readBack = new TextDecoder().decode(new Uint8Array(memoryBuffer, 2900, 4));
  assertEq(readBack, 'test');
});

test('writeI32 writes 32-bit integer', () => {
  bridge.writeI32(3000, 0x12345678);
  assertEq(new Int32Array(memoryBuffer, 3000, 1)[0], 0x12345678);
});

test('writeF64 writes 64-bit float', () => {
  bridge.writeF64(3008, Math.PI); // 8-byte aligned
  const val = new Float64Array(memoryBuffer, 3008, 1)[0];
  assert(Math.abs(val - Math.PI) < 1e-10);
});

// ---- Summary ----
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
