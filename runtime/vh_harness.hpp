// vh_harness.hpp — VectorHeart Exception-Safe Hypercall Harness
//
// Registers syscall handlers for ecalls 600-803 that bridge guest
// LD_PRELOAD calls to host-side JavaScript functions via JSPI.
//
// ARCHITECTURE:
//   libriscv core: uses -fwasm-exceptions for control flow (timeouts, stops)
//   VH harness:    acts as a "No-Throw Zone" — never lets JS errors
//                  propagate as C++ exceptions through a JSPI-suspended stack.
//                  All JS functions have internal try/catch returning -1 on error.
//
// The JS functions (library_vectorheart.js) are linked via --js-library.
// Async ones (js_opfs_io, js_net_proxy) are on JSPI_IMPORTS — the linker
// wraps them with WebAssembly.Suspending automatically.
// Sync ones (js_compute_offload, js_gettime_ms) have zero JSPI overhead.

#pragma once

#include <libriscv/machine.hpp>
#include <cstring>
#include <iostream>
#include <sys/time.h>

#ifdef __EMSCRIPTEN__
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#endif

namespace vh {

using Machine = riscv::Machine<riscv::RISCV64>;
using addr_t = riscv::address_type<riscv::RISCV64>;

// ============================================================================
// Extern JS functions (implemented in library_vectorheart.js)
// Async functions are on JSPI_IMPORTS list — JSPI suspends Wasm stack.
// Sync functions are NOT on JSPI_IMPORTS — zero suspension overhead.
// ============================================================================
#ifdef __EMSCRIPTEN__
extern "C" {
    // Async (JSPI-suspended)
    long js_opfs_io(int fd, void* buf, size_t len, int op, long off);
    long js_net_proxy(int fd, const char* ip, int port, int op, void* buf, size_t len);
    long js_dns_resolve(const char* host, size_t host_len, char* ip_buf, size_t ip_buf_len, int port);

    // Sync (no JSPI overhead)
    long js_compute_offload(int op, void* p1, size_t l1, void* p2, size_t l2);
    long js_gettime_ms(void);
}
#else
// Native stubs
#include <time.h>
static long js_opfs_io(int, void*, size_t, int, long) { return -38; }
static long js_net_proxy(int, const char*, int, int, void*, size_t) { return -38; }
static long js_dns_resolve(const char*, size_t, char*, size_t, int) { return -38; }
static long js_compute_offload(int, void*, size_t, void*, size_t) { return -38; }
static long js_gettime_ms(void) {
    struct timespec ts;
    clock_gettime(CLOCK_REALTIME, &ts);
    return ts.tv_sec * 1000L + ts.tv_nsec / 1000000L;
}
#endif

// ============================================================================
// Registration — lambda-based handlers using sysargs<>() structured bindings
// ============================================================================
inline void setup_vh_harness(Machine& machine) {

    // ------------------------------------------------------------------
    // 600 Series: FS / OPFS
    // ------------------------------------------------------------------

    // 600: open(path_ptr, flags, mode) -> fd
    machine.install_syscall_handler(600, [](Machine& m) {
        auto path = m.memory.memstring(m.sysarg(0));
        m.set_result(js_opfs_io(0, (void*)path.c_str(), path.size(), 600, 0));
    });

    // 601: write(fd, buf_ptr, count) -> bytes_written
    machine.install_syscall_handler(601, [](Machine& m) {
        auto [fd, buf_addr, len] = m.sysargs<int, addr_t, size_t>();
        auto* buf = m.memory.memarray<uint8_t>(buf_addr, len);
        m.set_result(js_opfs_io(fd, buf, len, 601, 0));
    });

    // 602: read(fd, buf_ptr, count) -> bytes_read
    machine.install_syscall_handler(602, [](Machine& m) {
        auto [fd, buf_addr, len] = m.sysargs<int, addr_t, size_t>();
        auto* buf = m.memory.memarray<uint8_t>(buf_addr, len);
        m.set_result(js_opfs_io(fd, buf, len, 602, 0));
    });

    // 603: close(fd) -> 0
    machine.install_syscall_handler(603, [](Machine& m) {
        m.set_result(js_opfs_io(m.sysarg<int>(0), nullptr, 0, 603, 0));
    });

    // 604: pread(fd, buf_ptr, count, offset) -> bytes_read
    machine.install_syscall_handler(604, [](Machine& m) {
        auto [fd, buf_addr, len, off] = m.sysargs<int, addr_t, size_t, long>();
        auto* buf = m.memory.memarray<uint8_t>(buf_addr, len);
        m.set_result(js_opfs_io(fd, buf, len, 604, off));
    });

    // ------------------------------------------------------------------
    // 700 Series: Compute / Crypto
    // All sync — zero JSPI overhead.
    // ------------------------------------------------------------------

    // 700: vh_magic_call(type, data_ptr, len)
    machine.install_syscall_handler(700, [](Machine& m) {
        auto [type, data_addr, len] = m.sysargs<int, addr_t, size_t>();
        auto* data = m.memory.memarray<uint8_t>(data_addr, len);
        m.set_result(js_compute_offload(type, data, len, nullptr, 0));
    });

    // 703: memmove(dest_ptr, src_ptr, len) -> dest_ptr
    // Direct host-side memmove on arena memory — orders of magnitude
    // faster than emulated instruction-by-instruction copy.
    machine.install_syscall_handler(703, [](Machine& m) {
        auto [dest_addr, src_addr, len] = m.sysargs<addr_t, addr_t, size_t>();
        auto* dest = m.memory.memarray<uint8_t>(dest_addr, len);
        auto* src  = m.memory.memarray<uint8_t>(src_addr, len);
        if (dest && src && len > 0) {
            std::memmove(dest, src, len);
        }
        m.set_result(dest_addr);
    });

    // 704: gettimeofday(tv_ptr) -> 0
    // Guest is RV64: struct timeval = { int64_t tv_sec; int64_t tv_usec; } = 16 bytes.
    // Host is wasm32: struct timeval = { int32_t; int32_t; } = 8 bytes.
    // Must use explicit 64-bit writes to match guest layout.
    machine.install_syscall_handler(704, [](Machine& m) {
        auto addr = m.sysarg(0);
        if (addr) {
            long ms = js_gettime_ms();
            int64_t sec = ms / 1000;
            int64_t usec = (ms % 1000) * 1000;
            m.memory.template write<int64_t>(addr, sec);
            m.memory.template write<int64_t>(addr + 8, usec);
        }
        m.set_result(0);
    });

    // 705: getrandom(buf_ptr, len, flags) -> bytes_written
    machine.install_syscall_handler(705, [](Machine& m) {
        auto buf_addr = m.sysarg(0);
        auto len = (size_t)m.sysarg(1);
        auto* buf = m.memory.memarray<uint8_t>(buf_addr, len);
        m.set_result(js_compute_offload(705, buf, len, nullptr, 0));
    });

    // 706: iconv(cd, ib, ibl, ob, obl) -> converted
    machine.install_syscall_handler(706, [](Machine& m) {
        m.set_result(js_compute_offload(706,
            (void*)(uintptr_t)m.sysarg(0), m.sysarg(1),
            (void*)(uintptr_t)m.sysarg(2), m.sysarg(3)));
    });

    // 708: JSON parse/validate(buf_ptr, len) -> 0 or -1
    machine.install_syscall_handler(708, [](Machine& m) {
        auto buf_addr = m.sysarg(0);
        auto len = (size_t)m.sysarg(1);
        auto* buf = m.memory.memarray<uint8_t>(buf_addr, len);
        m.set_result(js_compute_offload(708, buf, len, nullptr, 0));
    });

    // ------------------------------------------------------------------
    // 800 Series: Networking
    // Async — js_net_proxy is on JSPI_IMPORTS, JSPI suspends Wasm stack.
    // ------------------------------------------------------------------

    // 800: connect(sockfd, sockaddr_ptr, addrlen) -> synthetic_fd or -errno
#ifdef __EMSCRIPTEN__
    machine.install_syscall_handler(800, [](Machine& m) {
        auto sockfd = m.sysarg<int>(0);
        auto* sin = m.memory.memarray<struct sockaddr_in>(m.sysarg(1), 1);
        if (!sin) { m.set_result(-14); return; }
        char ip_str[INET_ADDRSTRLEN];
        inet_ntop(AF_INET, &sin->sin_addr, ip_str, sizeof(ip_str));
        m.set_result(js_net_proxy(sockfd, ip_str, ntohs(sin->sin_port), 800, nullptr, 0));
    });
#else
    machine.install_syscall_handler(800, [](Machine& m) { m.set_result(-38); });
#endif

    // 801: getaddrinfo(node_ptr, service_ptr, hints_ptr, res_ptr) -> 0 or error
    // Routes to js_net_proxy with op=801, which performs DNS resolution.
#ifdef __EMSCRIPTEN__
    machine.install_syscall_handler(801, [](Machine& m) {
        auto node = m.memory.memstring(m.sysarg(0));
        // Use js_dns_resolve for proper async DNS via Cloudflare DoH
        char ip_buf[64] = {0};
        long ret = js_dns_resolve(node.c_str(), node.size(), ip_buf, sizeof(ip_buf), 0);
        if (ret == 0) {
            // Write result back — guest addrinfo* at sysarg(3)
            // For simplicity, write the IP as a sockaddr_in to the result pointer
            auto res_ptr_addr = m.sysarg(3);
            if (res_ptr_addr) {
                // Write IP string to a well-known guest buffer location
                // The guest shim will parse it
                auto* result_buf = m.memory.memarray<uint8_t>(res_ptr_addr, 128);
                if (result_buf) {
                    size_t ip_len = strlen(ip_buf);
                    std::memcpy(result_buf, ip_buf, ip_len + 1);
                }
            }
        }
        m.set_result(ret);
    });
#else
    machine.install_syscall_handler(801, [](Machine& m) { m.set_result(-38); });
#endif

    // 802: net_write(fd, buf_ptr, count) -> bytes_written
    machine.install_syscall_handler(802, [](Machine& m) {
        auto [fd, buf_addr, len] = m.sysargs<int, addr_t, size_t>();
        auto* buf = m.memory.memarray<uint8_t>(buf_addr, len);
        m.set_result(js_net_proxy(fd, nullptr, 0, 802, buf, len));
    });

    // 803: net_read(fd, buf_ptr, count) -> bytes_read
    machine.install_syscall_handler(803, [](Machine& m) {
        auto [fd, buf_addr, len] = m.sysargs<int, addr_t, size_t>();
        auto* buf = m.memory.memarray<uint8_t>(buf_addr, len);
        m.set_result(js_net_proxy(fd, nullptr, 0, 803, buf, len));
    });

    std::cerr << "[vh] VectorHeart hypercall harness installed (ecalls 600-803)\n";
    std::cerr << "[vh] JSPI async: js_opfs_io, js_net_proxy, js_dns_resolve\n";
    std::cerr << "[vh] Sync (no JSPI): js_compute_offload, js_gettime_ms\n";
}

}  // namespace vh
