// Emscripten pre-js compatibility shim.
//
// Emscripten 5.0.x glue may reference ENVIRONMENT_IS_WASM_WORKER without
// declaring it in some configurations. Define it defensively so startup does
// not abort with a ReferenceError that propagates as RuntimeError: unreachable.
if (typeof ENVIRONMENT_IS_WASM_WORKER === 'undefined') {
  var ENVIRONMENT_IS_WASM_WORKER = false;
}
