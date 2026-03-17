// ==========================================================================
// THIS FILE IS DEPRECATED — DO NOT USE
// ==========================================================================
//
// The correct approach is to compile real Abseil source files with:
//   -DABSL_FORCE_WAITER_MODE=4
//
// This selects StdcppWaiter, which uses std::mutex and
// std::condition_variable — both supported by Emscripten.
//
// See: compile_abseil.sh for the real build.
//
// This stub file is kept only as a historical reference of what NOT to do.
// Stubs hide real bugs and create ABI mismatches.
// ==========================================================================
#error "Do not compile this file. Use compile_abseil.sh to build real Abseil."
