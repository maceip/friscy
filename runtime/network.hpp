// network.hpp - Socket syscall handlers for friscy
//
// This implements Linux socket syscalls by bridging to a host-side network
// stack via WebSocket. In the browser, this connects to a gvisor-tap-vsock
// based proxy running on the host.
//
// Architecture:
//   Guest (RISC-V) -> libriscv syscall -> network.hpp -> JS bridge -> WebSocket
//   -> Host Go process (gvisor-tap-vsock) -> Real network
//
// For standalone/native builds, we can optionally use real sockets directly.

#pragma once

#include <libriscv/machine.hpp>
#include <cstdint>
#include <unordered_map>
#include <vector>
#include <functional>
#include <cstring>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#else
// Native: use real POSIX sockets
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>
#endif

namespace net {

using Machine = riscv::Machine<riscv::RISCV64>;

// Socket address structures (matching Linux/RISC-V ABI)
struct sockaddr_in {
    uint16_t sin_family;
    uint16_t sin_port;
    uint32_t sin_addr;
    uint8_t  sin_zero[8];
};

struct sockaddr_in6 {
    uint16_t sin6_family;
    uint16_t sin6_port;
    uint32_t sin6_flowinfo;
    uint8_t  sin6_addr[16];
    uint32_t sin6_scope_id;
};

// Socket constants (in namespace to avoid macro clashes with system headers)
namespace sock {
    constexpr int STREAM = 1;
    constexpr int DGRAM  = 2;
    constexpr int RAW    = 3;
}

namespace af {
    constexpr int UNIX  = 1;
    constexpr int INET  = 2;
    constexpr int INET6 = 10;
}

namespace sol {
    constexpr int SOCKET = 1;
}

namespace so {
    constexpr int REUSEADDR = 2;
    constexpr int ERROR = 4;
    constexpr int KEEPALIVE = 9;
}

// Error codes (negated for syscall return)
namespace err {
    constexpr int64_t AFNOSUPPORT = -97;
    constexpr int64_t CONNREFUSED = -111;
    constexpr int64_t INPROGRESS  = -115;
    constexpr int64_t NOTCONN     = -107;
    constexpr int64_t ALREADY     = -114;
    constexpr int64_t NOSYS       = -38;
    constexpr int64_t NOTSOCK     = -88;
    constexpr int64_t DESTADDRREQ = -89;
    constexpr int64_t MSGSIZE     = -90;
    constexpr int64_t PROTOTYPE   = -91;
    constexpr int64_t NOPROTOOPT  = -92;
    constexpr int64_t PROTONOSUPPORT = -93;
    constexpr int64_t OPNOTSUPP   = -95;
    constexpr int64_t ADDRINUSE   = -98;
    constexpr int64_t ADDRNOTAVAIL = -99;
    constexpr int64_t NETDOWN     = -100;
    constexpr int64_t NETUNREACH  = -101;
    constexpr int64_t CONNABORTED = -103;
    constexpr int64_t CONNRESET   = -104;
    constexpr int64_t NOBUFS      = -105;
    constexpr int64_t ISCONN      = -106;
    constexpr int64_t TIMEDOUT    = -110;
    constexpr int64_t HOSTUNREACH = -113;
}

// Virtual socket state
struct VSocket {
    int fd;                  // Guest file descriptor
    int domain;              // AF_INET, AF_INET6, etc.
    int type;                // SOCK_STREAM, SOCK_DGRAM, etc.
    int protocol;
    bool connected;
    bool listening;
    bool nonblocking;

#ifndef __EMSCRIPTEN__
    int native_fd;           // Real socket fd for native builds
#endif

    // For connected sockets
    std::vector<uint8_t> recv_buffer;

    // Callback for async operations (used in Wasm)
    std::function<void(int result)> on_connect;
    std::function<void(const uint8_t*, size_t)> on_recv;

    VSocket() : fd(-1), domain(0), type(0), protocol(0),
                connected(false), listening(false), nonblocking(false)
#ifndef __EMSCRIPTEN__
                , native_fd(-1)
#endif
    {}
};

// Network context - holds all virtual sockets
class NetworkContext {
public:
    static constexpr int SOCKET_FD_BASE = 1000;  // Start socket FDs here to avoid VFS collision

    NetworkContext() : next_fd_(SOCKET_FD_BASE) {}

    int create_socket(int domain, int type, int protocol) {
        if (domain != af::INET && domain != af::INET6) {
            return err::AFNOSUPPORT;
        }
        if (type != sock::STREAM && type != sock::DGRAM) {
            return err::PROTOTYPE;
        }

#ifndef __EMSCRIPTEN__
        // Native: create a real socket
        int native_fd = ::socket(domain, type, protocol);
        if (native_fd < 0) {
            return -errno;
        }
#endif

        int fd = next_fd_++;
        VSocket sock;
        sock.fd = fd;
        sock.domain = domain;
        sock.type = type;
        sock.protocol = protocol;
        sock.connected = false;
        sock.listening = false;
        sock.nonblocking = false;

#ifndef __EMSCRIPTEN__
        sock.native_fd = native_fd;
#endif

        sockets_[fd] = std::move(sock);

#ifdef __EMSCRIPTEN__
        // Notify JS side of new socket
        notify_socket_created(fd, domain, type);
#endif

        return fd;
    }

    VSocket* get_socket(int fd) {
        auto it = sockets_.find(fd);
        if (it == sockets_.end()) return nullptr;
        return &it->second;
    }

    int close_socket(int fd) {
        auto it = sockets_.find(fd);
        if (it == sockets_.end()) return err::NOTSOCK;

#ifdef __EMSCRIPTEN__
        notify_socket_closed(fd);
#else
        // Native: close real socket
        if (it->second.native_fd >= 0) {
            ::close(it->second.native_fd);
        }
#endif

        sockets_.erase(it);
        return 0;
    }

    bool is_socket_fd(int fd) const {
        return fd >= SOCKET_FD_BASE && sockets_.count(fd) > 0;
    }

private:
    int next_fd_;
    std::unordered_map<int, VSocket> sockets_;

#ifdef __EMSCRIPTEN__
    // JavaScript bridge functions (implemented in network_bridge.js)
    static void notify_socket_created(int fd, int domain, int type) {
        EM_ASM({
            if (typeof Module.onSocketCreated === 'function') {
                Module.onSocketCreated($0, $1, $2);
            }
        }, fd, domain, type);
    }

    static void notify_socket_closed(int fd) {
        EM_ASM({
            if (typeof Module.onSocketClosed === 'function') {
                Module.onSocketClosed($0);
            }
        }, fd);
    }
#endif
};

// Global network context
inline NetworkContext& get_network_ctx() {
    static NetworkContext ctx;
    return ctx;
}

// =============================================================================
// Syscall handlers
// =============================================================================

// syscall 198: socket(domain, type, protocol)
inline void sys_socket(Machine& m) {
    int domain = m.template sysarg<int>(0);
    int type = m.template sysarg<int>(1);
    int protocol = m.template sysarg<int>(2);

    // Strip SOCK_NONBLOCK and SOCK_CLOEXEC flags
    bool nonblock = (type & 0x800) != 0;
    type &= ~0x800;
    type &= ~0x80000;

    int result = get_network_ctx().create_socket(domain, type, protocol);

    if (result >= 0 && nonblock) {
        auto* sock = get_network_ctx().get_socket(result);
        if (sock) sock->nonblocking = true;
    }

    m.set_result(result);
}

// syscall 200: bind(sockfd, addr, addrlen)
inline void sys_bind(Machine& m) {
    int sockfd = m.template sysarg<int>(0);
    uint64_t addr_ptr = m.template sysarg<uint64_t>(1);
    uint32_t addrlen = m.template sysarg<uint32_t>(2);

    auto* sock = get_network_ctx().get_socket(sockfd);
    if (!sock) {
        m.set_result(err::NOTSOCK);
        return;
    }

    // Read the sockaddr from guest memory
    if (addrlen < 2) {
        m.set_result(-22);  // EINVAL
        return;
    }

    // For now, accept any bind (we're not actually binding to a port)
    // The host-side proxy will handle actual binding

#ifdef __EMSCRIPTEN__
    // Read address and notify JS
    std::vector<uint8_t> addr_data(addrlen);
    m.memory.memcpy_out(addr_data.data(), addr_ptr, addrlen);

    EM_ASM({
        if (typeof Module.onSocketBind === 'function') {
            const addr = new Uint8Array(Module.HEAPU8.buffer, $1, $2);
            Module.onSocketBind($0, addr);
        }
    }, sockfd, addr_data.data(), addrlen);
#endif

    m.set_result(0);
}

// syscall 201: listen(sockfd, backlog)
inline void sys_listen(Machine& m) {
    int sockfd = m.template sysarg<int>(0);
    int backlog = m.template sysarg<int>(1);
    (void)backlog;

    auto* sock = get_network_ctx().get_socket(sockfd);
    if (!sock) {
        m.set_result(err::NOTSOCK);
        return;
    }

    sock->listening = true;

#ifdef __EMSCRIPTEN__
    EM_ASM({
        if (typeof Module.onSocketListen === 'function') {
            Module.onSocketListen($0, $1);
        }
    }, sockfd, backlog);
#endif

    m.set_result(0);
}

// syscall 202: accept(sockfd, addr, addrlen) / accept4
inline void sys_accept(Machine& m) {
    int sockfd = m.template sysarg<int>(0);
    uint64_t addr_ptr = m.template sysarg<uint64_t>(1);
    uint64_t addrlen_ptr = m.template sysarg<uint64_t>(2);
    (void)addr_ptr;
    (void)addrlen_ptr;

    auto* sock = get_network_ctx().get_socket(sockfd);
    if (!sock) {
        m.set_result(err::NOTSOCK);
        return;
    }

    if (!sock->listening) {
        m.set_result(-22);  // EINVAL
        return;
    }

    // In async mode, this would block/return EAGAIN
    // For now, stub as not implemented
    m.set_result(err::NOSYS);
}

// syscall 203: connect(sockfd, addr, addrlen)
inline void sys_connect(Machine& m) {
    int sockfd = m.template sysarg<int>(0);
    uint64_t addr_ptr = m.template sysarg<uint64_t>(1);
    uint32_t addrlen = m.template sysarg<uint32_t>(2);

    auto* sock = get_network_ctx().get_socket(sockfd);
    if (!sock) {
        m.set_result(err::NOTSOCK);
        return;
    }

    if (sock->connected) {
        m.set_result(err::ISCONN);
        return;
    }

    // Read the sockaddr from guest memory
    std::vector<uint8_t> addr_data(addrlen);
    m.memory.memcpy_out(addr_data.data(), addr_ptr, addrlen);

#ifdef __EMSCRIPTEN__
    // Pass to JavaScript for WebSocket connection
    int result = EM_ASM_INT({
        if (typeof Module.onSocketConnect === 'function') {
            const addr = new Uint8Array(Module.HEAPU8.buffer, $1, $2);
            return Module.onSocketConnect($0, addr);
        }
        return -38;  // ENOSYS
    }, sockfd, addr_data.data(), addrlen);

    if (result == 0) {
        sock->connected = true;
    }
    m.set_result(result);
#else
    // Native: use real connect
    struct ::sockaddr_in native_addr;
    memcpy(&native_addr, addr_data.data(), std::min(addrlen, (uint32_t)sizeof(native_addr)));

    int result = ::connect(sock->native_fd, (struct sockaddr*)&native_addr, addrlen);
    if (result == 0) {
        sock->connected = true;
        m.set_result(0);
    } else {
        m.set_result(-errno);
    }
#endif
}

// syscall 206: sendto(sockfd, buf, len, flags, dest_addr, addrlen)
inline void sys_sendto(Machine& m) {
    int sockfd = m.template sysarg<int>(0);
    uint64_t buf_ptr = m.template sysarg<uint64_t>(1);
    size_t len = m.template sysarg<size_t>(2);
    int flags = m.template sysarg<int>(3);
    (void)flags;

    auto* sock = get_network_ctx().get_socket(sockfd);
    if (!sock) {
        m.set_result(err::NOTSOCK);
        return;
    }

    if (sock->type == sock::STREAM && !sock->connected) {
        m.set_result(err::NOTCONN);
        return;
    }

    // Read data from guest memory
    std::vector<uint8_t> data(len);
    m.memory.memcpy_out(data.data(), buf_ptr, len);

#ifdef __EMSCRIPTEN__
    int result = EM_ASM_INT({
        if (typeof Module.onSocketSend === 'function') {
            const data = new Uint8Array(Module.HEAPU8.buffer, $1, $2);
            return Module.onSocketSend($0, data);
        }
        return -38;
    }, sockfd, data.data(), len);

    m.set_result(result >= 0 ? (int64_t)len : result);
#else
    // Native: use real send
    ssize_t result = ::send(sock->native_fd, data.data(), len, 0);
    if (result >= 0) {
        m.set_result(result);
    } else {
        m.set_result(-errno);
    }
#endif
}

// syscall 207: recvfrom(sockfd, buf, len, flags, src_addr, addrlen)
inline void sys_recvfrom(Machine& m) {
    int sockfd = m.template sysarg<int>(0);
    uint64_t buf_ptr = m.template sysarg<uint64_t>(1);
    size_t len = m.template sysarg<size_t>(2);
    int flags = m.template sysarg<int>(3);
    (void)flags;

    auto* sock = get_network_ctx().get_socket(sockfd);
    if (!sock) {
        m.set_result(err::NOTSOCK);
        return;
    }

    if (sock->type == sock::STREAM && !sock->connected) {
        m.set_result(err::NOTCONN);
        return;
    }

#ifdef __EMSCRIPTEN__
    // Check if we have buffered data
    if (!sock->recv_buffer.empty()) {
        size_t to_copy = std::min(len, sock->recv_buffer.size());
        m.memory.memcpy(buf_ptr, sock->recv_buffer.data(), to_copy);
        sock->recv_buffer.erase(sock->recv_buffer.begin(),
                                 sock->recv_buffer.begin() + to_copy);
        m.set_result(to_copy);
        return;
    }

    // No buffered data - would need async handling
    if (sock->nonblocking) {
        m.set_result(-11);  // EAGAIN
    } else {
        // Blocking recv not supported in Wasm main thread
        m.set_result(-11);
    }
#else
    // Native: use real recv
    std::vector<uint8_t> buf(len);
    ssize_t result = ::recv(sock->native_fd, buf.data(), len, 0);
    if (result > 0) {
        m.memory.memcpy(buf_ptr, buf.data(), result);
        m.set_result(result);
    } else if (result == 0) {
        m.set_result(0);  // Connection closed
    } else {
        m.set_result(-errno);
    }
#endif
}

// syscall 208: setsockopt
inline void sys_setsockopt(Machine& m) {
    int sockfd = m.template sysarg<int>(0);
    int level = m.template sysarg<int>(1);
    int optname = m.template sysarg<int>(2);
    (void)level;
    (void)optname;

    auto* sock = get_network_ctx().get_socket(sockfd);
    if (!sock) {
        m.set_result(err::NOTSOCK);
        return;
    }

    // Accept most options silently
    m.set_result(0);
}

// syscall 209: getsockopt
inline void sys_getsockopt(Machine& m) {
    int sockfd = m.template sysarg<int>(0);
    int level = m.template sysarg<int>(1);
    int optname = m.template sysarg<int>(2);
    uint64_t optval_ptr = m.template sysarg<uint64_t>(3);
    uint64_t optlen_ptr = m.template sysarg<uint64_t>(4);
    (void)level;

    auto* sock = get_network_ctx().get_socket(sockfd);
    if (!sock) {
        m.set_result(err::NOTSOCK);
        return;
    }

    // Handle SO_ERROR specially
    if (optname == so::ERROR) {
        int32_t error = 0;
        m.memory.memcpy(optval_ptr, &error, sizeof(error));
        int32_t len = sizeof(error);
        m.memory.memcpy(optlen_ptr, &len, sizeof(len));
        m.set_result(0);
        return;
    }

    m.set_result(err::NOPROTOOPT);
}

// syscall 210: shutdown
inline void sys_shutdown(Machine& m) {
    int sockfd = m.template sysarg<int>(0);
    int how = m.template sysarg<int>(1);
    (void)how;

    auto* sock = get_network_ctx().get_socket(sockfd);
    if (!sock) {
        m.set_result(err::NOTSOCK);
        return;
    }

#ifdef __EMSCRIPTEN__
    EM_ASM({
        if (typeof Module.onSocketShutdown === 'function') {
            Module.onSocketShutdown($0, $1);
        }
    }, sockfd, how);
#endif

    m.set_result(0);
}

// syscall 204: getsockname
inline void sys_getsockname(Machine& m) {
    int sockfd = m.template sysarg<int>(0);
    uint64_t addr_ptr = m.template sysarg<uint64_t>(1);
    uint64_t addrlen_ptr = m.template sysarg<uint64_t>(2);

    auto* sock = get_network_ctx().get_socket(sockfd);
    if (!sock) {
        m.set_result(err::NOTSOCK);
        return;
    }

    // Return a default address
    sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = af::INET;
    addr.sin_port = 0;
    addr.sin_addr = 0x0100007f;  // 127.0.0.1

    int32_t len = sizeof(addr);
    m.memory.memcpy(addr_ptr, &addr, sizeof(addr));
    m.memory.memcpy(addrlen_ptr, &len, sizeof(len));

    m.set_result(0);
}

// syscall 205: getpeername
inline void sys_getpeername(Machine& m) {
    int sockfd = m.template sysarg<int>(0);

    auto* sock = get_network_ctx().get_socket(sockfd);
    if (!sock) {
        m.set_result(err::NOTSOCK);
        return;
    }

    if (!sock->connected) {
        m.set_result(err::NOTCONN);
        return;
    }

    // Would need to track peer address
    m.set_result(err::NOSYS);
}

// syscall 72: pselect6 (for socket readiness checking)
inline void sys_pselect6(Machine& m) {
    // Stub - return immediately with no ready descriptors
    m.set_result(0);
}

// syscall 73: ppoll (for socket readiness checking)
inline void sys_ppoll(Machine& m) {
    // Stub - return immediately with no ready descriptors
    m.set_result(0);
}

// Install all network syscall handlers
inline void install_network_syscalls(Machine& machine) {
    // RISC-V Linux syscall numbers
    machine.install_syscall_handler(198, sys_socket);
    machine.install_syscall_handler(200, sys_bind);
    machine.install_syscall_handler(201, sys_listen);
    machine.install_syscall_handler(202, sys_accept);
    machine.install_syscall_handler(203, sys_connect);
    machine.install_syscall_handler(204, sys_getsockname);
    machine.install_syscall_handler(205, sys_getpeername);
    machine.install_syscall_handler(206, sys_sendto);
    machine.install_syscall_handler(207, sys_recvfrom);
    machine.install_syscall_handler(208, sys_setsockopt);
    machine.install_syscall_handler(209, sys_getsockopt);
    machine.install_syscall_handler(210, sys_shutdown);
    machine.install_syscall_handler(72, sys_pselect6);
    machine.install_syscall_handler(73, sys_ppoll);
}

}  // namespace net
