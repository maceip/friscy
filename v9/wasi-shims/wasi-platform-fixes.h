/**
 * Platform-specific fixes for EdgeJS on Emscripten.
 *
 * Adapted from node-wasix32's wasi-platform-fixes.h.
 * Addresses platform detection and feature availability gaps
 * between what Node.js/libuv expects and what Emscripten provides.
 */

#ifndef EDGEJS_WASI_PLATFORM_FIXES_H
#define EDGEJS_WASI_PLATFORM_FIXES_H

#if defined(__EMSCRIPTEN__) || defined(__wasi__)

#include <emscripten.h>
#include <emscripten/threading.h>

/* ---- libuv Platform Backend ----
 * libuv uses epoll (Linux), kqueue (macOS), IOCP (Windows).
 * None exist in Emscripten. The JSPI adapter replaces these,
 * but libuv's configure step may still check for them.
 */
#ifndef UV_HAVE_KQUEUE
#define UV_HAVE_KQUEUE 0
#endif
#ifndef UV_HAVE_EPOLL
#define UV_HAVE_EPOLL 0
#endif

/* ---- Process / PID ----
 * Emscripten provides getpid() returning 42, but some Node.js
 * internals expect more process control.
 */
#ifndef HAVE_POSIX_SPAWN
#define HAVE_POSIX_SPAWN 0
#endif

/* ---- Filesystem Features ----
 * Emscripten's MEMFS/NODEFS don't support everything.
 */
#ifndef HAVE_INOTIFY
#define HAVE_INOTIFY 0
#endif
#ifndef HAVE_FANOTIFY
#define HAVE_FANOTIFY 0
#endif

/* ---- Network Features ----
 * Emscripten has partial socket support but not full POSIX sockets.
 * Network I/O goes through WebTransport proxy instead.
 */
#ifndef HAVE_UNIX_SOCKETS
#define HAVE_UNIX_SOCKETS 0
#endif

/* ---- Memory-Mapped I/O ----
 * Emscripten has mmap but it's emulated over linear memory.
 * These flags help libuv/Node.js avoid unsupported mmap patterns.
 */
#ifndef MAP_HUGETLB
#define MAP_HUGETLB 0
#endif
#ifndef MAP_HUGE_2MB
#define MAP_HUGE_2MB 0
#endif

/* ---- CPU Features ----
 * Wasm doesn't expose CPU topology, but some Node.js code checks.
 */
#ifndef _SC_NPROCESSORS_ONLN
/* Emscripten already defines this via sysconf */
#endif

/* ---- TTY / PTY ----
 * Terminal handling for CLI apps (Claude Code, Codex, Gemini).
 * Emscripten has limited TTY support. We bridge to xterm.js.
 */
#ifndef HAVE_OPENPTY
#define HAVE_OPENPTY 0
#endif
#ifndef HAVE_FORKPTY
#define HAVE_FORKPTY 0
#endif

#endif /* __EMSCRIPTEN__ || __wasi__ */
#endif /* EDGEJS_WASI_PLATFORM_FIXES_H */
