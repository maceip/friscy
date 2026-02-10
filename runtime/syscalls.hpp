// syscalls.hpp - Linux syscall emulation for RISC-V 64-bit
// Implements the minimum viable syscall set for container workloads
//
// Uses libriscv's userdata mechanism to pass VFS to syscall handlers.
#pragma once

#include <libriscv/machine.hpp>
#include "vfs.hpp"
#include <ctime>
#include <cstring>
#include <random>
#include <iostream>
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif

namespace syscalls {

using Machine = riscv::Machine<riscv::RISCV64>;

// RISC-V 64-bit syscall numbers (from Linux kernel)
namespace nr {
    constexpr int getcwd        = 17;
    constexpr int dup           = 23;
    constexpr int dup3          = 24;
    constexpr int fcntl         = 25;
    constexpr int ioctl         = 29;
    constexpr int mkdirat       = 34;
    constexpr int unlinkat      = 35;
    constexpr int symlinkat     = 36;
    constexpr int linkat        = 37;
    constexpr int renameat      = 38;
    constexpr int ftruncate     = 46;
    constexpr int faccessat     = 48;
    constexpr int chdir         = 49;
    constexpr int openat        = 56;
    constexpr int close         = 57;
    constexpr int pipe2         = 59;
    constexpr int getdents64    = 61;
    constexpr int lseek         = 62;
    constexpr int read          = 63;
    constexpr int write         = 64;
    constexpr int readv         = 65;
    constexpr int writev        = 66;
    constexpr int pread64       = 67;
    constexpr int pwrite64      = 68;
    constexpr int sendfile      = 71;
    constexpr int readlinkat    = 78;
    constexpr int newfstatat    = 79;
    constexpr int fstat         = 80;
    constexpr int exit          = 93;
    constexpr int exit_group    = 94;
    constexpr int set_tid_address = 96;
    constexpr int clock_gettime = 113;
    constexpr int sigaction     = 134;
    constexpr int sigprocmask   = 135;
    constexpr int getpid        = 172;
    constexpr int getppid       = 173;
    constexpr int getuid        = 174;
    constexpr int geteuid       = 175;
    constexpr int getgid        = 176;
    constexpr int getegid       = 177;
    constexpr int gettid        = 178;
    constexpr int sysinfo       = 179;
    constexpr int brk           = 214;
    constexpr int munmap        = 215;
    constexpr int mmap          = 222;
    constexpr int mprotect      = 226;
    constexpr int prlimit64     = 261;
    constexpr int getrandom     = 278;
    constexpr int rseq          = 293;
}

// Linux stat64 structure for RISC-V 64
struct linux_stat64 {
    uint64_t st_dev;
    uint64_t st_ino;
    uint32_t st_mode;
    uint32_t st_nlink;
    uint32_t st_uid;
    uint32_t st_gid;
    uint64_t st_rdev;
    uint64_t __pad1;
    int64_t  st_size;
    int32_t  st_blksize;
    int32_t  __pad2;
    int64_t  st_blocks;
    int64_t  st_atime_sec;
    int64_t  st_atime_nsec;
    int64_t  st_mtime_sec;
    int64_t  st_mtime_nsec;
    int64_t  st_ctime_sec;
    int64_t  st_ctime_nsec;
    int32_t  __unused[2];
};

// Linux timespec
struct linux_timespec {
    int64_t tv_sec;
    int64_t tv_nsec;
};

// AT_* constants
constexpr int AT_FDCWD = -100;
constexpr int AT_EMPTY_PATH = 0x1000;
constexpr int AT_SYMLINK_NOFOLLOW = 0x100;

// O_* flags
constexpr int O_RDONLY = 0;
constexpr int O_WRONLY = 1;
constexpr int O_RDWR = 2;
constexpr int O_CREAT = 0100;
constexpr int O_EXCL = 0200;
constexpr int O_TRUNC = 01000;
constexpr int O_APPEND = 02000;
constexpr int O_DIRECTORY = 0200000;
constexpr int O_CLOEXEC = 02000000;

// Error codes (negated for syscall return values)
namespace err {
    constexpr int64_t NOENT = -2;
    constexpr int64_t BADF = -9;
    constexpr int64_t ACCES = -13;
    constexpr int64_t EXIST = -17;
    constexpr int64_t NOTDIR = -20;
    constexpr int64_t ISDIR = -21;
    constexpr int64_t INVAL = -22;
    constexpr int64_t NOSYS = -38;
    constexpr int64_t NOTSUP = -95;
}

// Context passed via machine userdata
struct SyscallContext {
    vfs::VirtualFS* fs;
    std::mt19937 rng;

    SyscallContext(vfs::VirtualFS* vfs) : fs(vfs) {
        std::random_device rd;
        rng.seed(rd());
    }
};

// Helper to get context from machine
inline SyscallContext* get_ctx(Machine& m) {
    return m.template get_userdata<SyscallContext>();
}

// Helper to get VFS from machine
inline vfs::VirtualFS& get_fs(Machine& m) {
    return *get_ctx(m)->fs;
}

// Syscall handlers (static functions, no captures)
namespace handlers {

static void sys_exit(Machine& m) {
    m.stop();
    m.set_result(m.template sysarg<int>(0));
}

static void sys_openat(Machine& m) {
    auto& fs = get_fs(m);
    int dirfd = m.template sysarg<int>(0);
    auto path_addr = m.sysarg(1);
    int flags = m.template sysarg<int>(2);

    if (dirfd != AT_FDCWD) {
        m.set_result(err::NOTSUP);
        return;
    }

    std::string path;
    try {
        path = m.memory.memstring(path_addr);
    } catch (...) {
        m.set_result(err::INVAL);
        return;
    }

    int fd = (flags & O_DIRECTORY) ? fs.opendir(path) : fs.open(path, flags);
    m.set_result(fd);
}

static void sys_close(Machine& m) {
    get_fs(m).close(m.template sysarg<int>(0));
    m.set_result(0);
}

static void sys_read(Machine& m) {
    auto& fs = get_fs(m);
    int fd = m.template sysarg<int>(0);
    auto buf_addr = m.sysarg(1);
    size_t count = m.sysarg(2);

    if (fd == 0) {
#ifdef __EMSCRIPTEN__
        // Read from JavaScript stdin buffer
        size_t bytes_read = 0;
        std::vector<uint8_t> buf(count);
        for (size_t i = 0; i < count; i++) {
            int ch = EM_ASM_INT({
                if (Module._stdinBuffer && Module._stdinBuffer.length > 0) {
                    return Module._stdinBuffer.shift();
                }
                return -1;
            });
            if (ch < 0) break;
            buf[bytes_read++] = (uint8_t)ch;
        }
        if (bytes_read > 0) {
            m.memory.memcpy(buf_addr, buf.data(), bytes_read);
        }
        m.set_result(bytes_read);
#else
        m.set_result(0);  // EOF for stdin
#endif
        return;
    }

    std::vector<uint8_t> buf(count);
    ssize_t n = fs.read(fd, buf.data(), count);
    if (n > 0) {
        m.memory.memcpy(buf_addr, buf.data(), n);
    }
    m.set_result(n);
}

static void sys_write(Machine& m) {
    auto& fs = get_fs(m);
    int fd = m.template sysarg<int>(0);
    auto buf_addr = m.sysarg(1);
    size_t count = m.sysarg(2);

    // stdout/stderr go to host
    if (fd == 1 || fd == 2) {
        try {
            auto view = m.memory.memview(buf_addr, count);
            auto& out = (fd == 1) ? std::cout : std::cerr;
            out.write(reinterpret_cast<const char*>(view.data()), count);
            out.flush();
            m.set_result(count);
        } catch (...) {
            m.set_result(err::INVAL);
        }
        return;
    }

    // VFS file writes
    if (fs.is_open(fd)) {
        std::vector<uint8_t> buf(count);
        m.memory.memcpy_out(buf.data(), buf_addr, count);
        ssize_t n = fs.write(fd, buf.data(), count);
        m.set_result(n);
        return;
    }

    m.set_result(err::BADF);
}

static void sys_writev(Machine& m) {
    auto& fs = get_fs(m);
    int fd = m.template sysarg<int>(0);
    auto iov_addr = m.sysarg(1);
    int iovcnt = m.template sysarg<int>(2);

    // stdout/stderr go to host
    if (fd == 1 || fd == 2) {
        size_t total = 0;
        auto& out = (fd == 1) ? std::cout : std::cerr;

        for (int i = 0; i < iovcnt; i++) {
            uint64_t base = m.memory.template read<uint64_t>(iov_addr + i * 16);
            uint64_t len = m.memory.template read<uint64_t>(iov_addr + i * 16 + 8);
            if (len > 0) {
                auto view = m.memory.memview(base, len);
                out.write(reinterpret_cast<const char*>(view.data()), len);
                total += len;
            }
        }
        out.flush();
        m.set_result(total);
        return;
    }

    // VFS file writes
    if (fs.is_open(fd)) {
        size_t total = 0;
        for (int i = 0; i < iovcnt; i++) {
            uint64_t base = m.memory.template read<uint64_t>(iov_addr + i * 16);
            uint64_t len = m.memory.template read<uint64_t>(iov_addr + i * 16 + 8);
            if (len > 0) {
                std::vector<uint8_t> buf(len);
                m.memory.memcpy_out(buf.data(), base, len);
                ssize_t n = fs.write(fd, buf.data(), len);
                if (n < 0) {
                    m.set_result(total > 0 ? (int64_t)total : n);
                    return;
                }
                total += n;
            }
        }
        m.set_result(total);
        return;
    }

    m.set_result(err::BADF);
}

static void sys_lseek(Machine& m) {
    auto& fs = get_fs(m);
    m.set_result(fs.lseek(
        m.template sysarg<int>(0),
        m.template sysarg<int64_t>(1),
        m.template sysarg<int>(2)
    ));
}

static void sys_getdents64(Machine& m) {
    auto& fs = get_fs(m);
    int fd = m.template sysarg<int>(0);
    auto buf_addr = m.sysarg(1);
    size_t count = m.sysarg(2);

    std::vector<uint8_t> buf(count);
    ssize_t n = fs.getdents64(fd, buf.data(), count);
    if (n > 0) {
        m.memory.memcpy(buf_addr, buf.data(), n);
    }
    m.set_result(n);
}

static void sys_newfstatat(Machine& m) {
    auto& fs = get_fs(m);
    int dirfd = m.template sysarg<int>(0);
    auto path_addr = m.sysarg(1);
    auto statbuf_addr = m.sysarg(2);
    int flags = m.template sysarg<int>(3);

    if (flags & AT_EMPTY_PATH) {
        m.set_result(err::NOTSUP);
        return;
    }

    if (dirfd != AT_FDCWD) {
        m.set_result(err::NOTSUP);
        return;
    }

    std::string path;
    try {
        path = m.memory.memstring(path_addr);
    } catch (...) {
        m.set_result(err::INVAL);
        return;
    }

    vfs::Entry entry;
    bool ok = (flags & AT_SYMLINK_NOFOLLOW) ? fs.lstat(path, entry) : fs.stat(path, entry);
    if (!ok) {
        m.set_result(err::NOENT);
        return;
    }

    linux_stat64 st = {};
    st.st_dev = 1;
    st.st_ino = std::hash<std::string>{}(path);
    st.st_mode = static_cast<uint32_t>(entry.type) | entry.mode;
    st.st_nlink = entry.is_dir() ? 2 : 1;
    st.st_uid = entry.uid;
    st.st_gid = entry.gid;
    st.st_size = entry.size;
    st.st_blksize = 4096;
    st.st_blocks = (entry.size + 511) / 512;
    st.st_mtime_sec = entry.mtime;
    st.st_atime_sec = entry.mtime;
    st.st_ctime_sec = entry.mtime;

    m.memory.memcpy(statbuf_addr, &st, sizeof(st));
    m.set_result(0);
}

static void sys_fstat(Machine& m) {
    auto& fs = get_fs(m);
    int fd = m.template sysarg<int>(0);
    auto statbuf_addr = m.sysarg(1);

    // stdin/stdout/stderr are character devices
    if (fd == 0 || fd == 1 || fd == 2) {
        linux_stat64 st = {};
        st.st_dev = 1;
        st.st_mode = 020666;  // Character device
        st.st_nlink = 1;
        st.st_blksize = 4096;
        m.memory.memcpy(statbuf_addr, &st, sizeof(st));
        m.set_result(0);
        return;
    }

    // VFS file descriptors
    auto entry = fs.get_entry(fd);
    if (entry) {
        std::string path = fs.get_path(fd);
        linux_stat64 st = {};
        st.st_dev = 1;
        st.st_ino = std::hash<std::string>{}(path);
        st.st_mode = static_cast<uint32_t>(entry->type) | entry->mode;
        st.st_nlink = entry->is_dir() ? 2 : 1;
        st.st_uid = entry->uid;
        st.st_gid = entry->gid;
        st.st_size = entry->size;
        st.st_blksize = 4096;
        st.st_blocks = (entry->size + 511) / 512;
        st.st_mtime_sec = entry->mtime;
        st.st_atime_sec = entry->mtime;
        st.st_ctime_sec = entry->mtime;
        m.memory.memcpy(statbuf_addr, &st, sizeof(st));
        m.set_result(0);
        return;
    }

    m.set_result(err::BADF);
}

static void sys_readlinkat(Machine& m) {
    auto& fs = get_fs(m);
    int dirfd = m.template sysarg<int>(0);
    auto path_addr = m.sysarg(1);
    auto buf_addr = m.sysarg(2);
    size_t bufsiz = m.sysarg(3);

    if (dirfd != AT_FDCWD) {
        m.set_result(err::NOTSUP);
        return;
    }

    std::string path;
    try {
        path = m.memory.memstring(path_addr);
    } catch (...) {
        m.set_result(err::INVAL);
        return;
    }

    std::vector<char> buf(bufsiz);
    ssize_t n = fs.readlink(path, buf.data(), bufsiz);
    if (n > 0) {
        m.memory.memcpy(buf_addr, buf.data(), n);
    }
    m.set_result(n);
}

static void sys_getcwd(Machine& m) {
    auto& fs = get_fs(m);
    auto buf_addr = m.sysarg(0);
    size_t size = m.sysarg(1);

    std::string cwd = fs.getcwd();
    if (cwd.size() + 1 > size) {
        m.set_result(-34);  // ERANGE
        return;
    }
    m.memory.memcpy(buf_addr, cwd.c_str(), cwd.size() + 1);
    m.set_result(buf_addr);
}

static void sys_chdir(Machine& m) {
    auto& fs = get_fs(m);
    std::string path;
    try {
        path = m.memory.memstring(m.sysarg(0));
    } catch (...) {
        m.set_result(err::INVAL);
        return;
    }
    m.set_result(fs.chdir(path) ? 0 : err::NOENT);
}

static void sys_faccessat(Machine& m) {
    auto& fs = get_fs(m);
    int dirfd = m.template sysarg<int>(0);

    if (dirfd != AT_FDCWD) {
        m.set_result(err::NOTSUP);
        return;
    }

    std::string path;
    try {
        path = m.memory.memstring(m.sysarg(1));
    } catch (...) {
        m.set_result(err::INVAL);
        return;
    }

    vfs::Entry entry;
    m.set_result(fs.stat(path, entry) ? 0 : err::NOENT);
}

static void sys_getpid(Machine& m) { m.set_result(1); }
static void sys_getppid(Machine& m) { m.set_result(0); }
static void sys_gettid(Machine& m) { m.set_result(1); }
static void sys_getuid(Machine& m) { m.set_result(0); }
static void sys_geteuid(Machine& m) { m.set_result(0); }
static void sys_getgid(Machine& m) { m.set_result(0); }
static void sys_getegid(Machine& m) { m.set_result(0); }
static void sys_set_tid_address(Machine& m) { m.set_result(1); }

static void sys_clock_gettime(Machine& m) {
    auto tp_addr = m.sysarg(1);
    struct timespec ts;
    clock_gettime(CLOCK_REALTIME, &ts);

    linux_timespec lts;
    lts.tv_sec = ts.tv_sec;
    lts.tv_nsec = ts.tv_nsec;
    m.memory.memcpy(tp_addr, &lts, sizeof(lts));
    m.set_result(0);
}

static void sys_getrandom(Machine& m) {
    auto* ctx = get_ctx(m);
    auto buf_addr = m.sysarg(0);
    size_t count = m.sysarg(1);

    std::vector<uint8_t> buf(count);
    for (size_t i = 0; i < count; i++) {
        buf[i] = ctx->rng() & 0xFF;
    }
    m.memory.memcpy(buf_addr, buf.data(), count);
    m.set_result(count);
}

// NOTE: brk, mmap, munmap, mprotect are handled by libriscv's
// setup_linux_syscalls() + add_mman_syscalls(). Do NOT override them here.
static void sys_sigaction(Machine& m) { m.set_result(0); }
static void sys_sigprocmask(Machine& m) { m.set_result(0); }
static void sys_prlimit64(Machine& m) { m.set_result(0); }
static void sys_rseq(Machine& m) { m.set_result(err::NOSYS); }

// sendfile(out_fd, in_fd, offset, count) - copy data between fds via VFS
static void sys_sendfile(Machine& m) {
    auto* ctx = get_ctx(m);
    int out_fd = m.template sysarg<int>(0);
    int in_fd = m.template sysarg<int>(1);
    auto offset_ptr = m.sysarg(2);
    size_t count = m.sysarg(3);

    // Read from in_fd
    if (count > 65536) count = 65536;  // cap single transfer
    std::vector<uint8_t> buf(count);

    // Handle offset if provided
    if (offset_ptr != 0) {
        int64_t off = m.memory.template read<int64_t>(offset_ptr);
        ssize_t n = ctx->fs->pread(in_fd, buf.data(), count, off);
        if (n < 0) { m.set_result(n); return; }
        // Update the offset
        m.memory.template write<int64_t>(offset_ptr, off + n);
        count = n;
    } else {
        ssize_t n = ctx->fs->read(in_fd, buf.data(), count);
        if (n < 0) { m.set_result(n); return; }
        count = n;
    }

    if (count == 0) { m.set_result(0); return; }

    // Write to out_fd
    if (out_fd == 1 || out_fd == 2) {
        // stdout/stderr - use printer
        m.print(reinterpret_cast<const char*>(buf.data()), count);
        m.set_result(count);
    } else {
        ssize_t n = ctx->fs->write(out_fd, buf.data(), count);
        m.set_result(n);
    }
}

static void sys_ioctl(Machine& m) {
    int fd = m.template sysarg<int>(0);
    unsigned long request = m.sysarg(1);

    // TIOCGWINSZ - get window size
    if (request == 0x5413 && (fd == 0 || fd == 1 || fd == 2)) {
        auto ws_addr = m.sysarg(2);
        uint16_t ws[4] = { 24, 80, 0, 0 };
        m.memory.memcpy(ws_addr, ws, sizeof(ws));
        m.set_result(0);
        return;
    }

    // TCGETS - get terminal attributes
    if (request == 0x5401 && (fd == 0 || fd == 1 || fd == 2)) {
        auto termios_addr = m.sysarg(2);
        // Return a plausible raw-mode termios struct
        // struct termios { c_iflag, c_oflag, c_cflag, c_lflag, c_line, c_cc[32], c_ispeed, c_ospeed }
        uint8_t termios_buf[60] = {};
        uint32_t c_iflag = 0;
        uint32_t c_oflag = 0;
        uint32_t c_cflag = 0x00bf;  // CS8 | CREAD | CLOCAL
        uint32_t c_lflag = 0;
        std::memcpy(termios_buf + 0, &c_iflag, 4);
        std::memcpy(termios_buf + 4, &c_oflag, 4);
        std::memcpy(termios_buf + 8, &c_cflag, 4);
        std::memcpy(termios_buf + 12, &c_lflag, 4);
        m.memory.memcpy(termios_addr, termios_buf, sizeof(termios_buf));
        m.set_result(0);
        return;
    }

    // TCSETS, TCSETSW, TCSETSF - set terminal attributes (accept silently)
    if ((request == 0x5402 || request == 0x5403 || request == 0x5404) &&
        (fd == 0 || fd == 1 || fd == 2)) {
        m.set_result(0);
        return;
    }

    m.set_result(err::NOTSUP);
}

static void sys_fcntl(Machine& m) {
    int cmd = m.template sysarg<int>(1);
    switch (cmd) {
        case 1: case 3:  // F_GETFD, F_GETFL
        case 2: case 4:  // F_SETFD, F_SETFL
            m.set_result(0);
            break;
        default:
            m.set_result(err::INVAL);
    }
}

static void sys_dup(Machine& m) {
    auto& fs = get_fs(m);
    int oldfd = m.template sysarg<int>(0);
    m.set_result(fs.dup(oldfd));
}

static void sys_dup3(Machine& m) {
    auto& fs = get_fs(m);
    int oldfd = m.template sysarg<int>(0);
    int newfd = m.template sysarg<int>(1);
    if (oldfd == newfd) {
        m.set_result(err::INVAL);
        return;
    }
    m.set_result(fs.dup2(oldfd, newfd));
}

static void sys_pipe2(Machine& m) {
    auto& fs = get_fs(m);
    auto pipefd_addr = m.sysarg(0);

    // Create a pipe using two connected in-memory file handles
    // Write end writes to a shared buffer, read end reads from it
    auto pipe_entry = std::make_shared<vfs::Entry>();
    pipe_entry->type = vfs::FileType::Fifo;
    pipe_entry->mode = 0600;
    pipe_entry->size = 0;

    // Allocate two fds - read end and write end
    int read_fd = fs.open_pipe(pipe_entry, 0);
    int write_fd = fs.open_pipe(pipe_entry, 1);

    int32_t fds[2] = { read_fd, write_fd };
    m.memory.memcpy(pipefd_addr, fds, sizeof(fds));
    m.set_result(0);
}

static void sys_readv(Machine& m) {
    auto& fs = get_fs(m);
    int fd = m.template sysarg<int>(0);
    auto iov_addr = m.sysarg(1);
    int iovcnt = m.template sysarg<int>(2);

    if (fd == 0) {
#ifdef __EMSCRIPTEN__
        // Read from JavaScript stdin buffer into iovec
        size_t total = 0;
        for (int i = 0; i < iovcnt; i++) {
            uint64_t base = m.memory.template read<uint64_t>(iov_addr + i * 16);
            uint64_t len = m.memory.template read<uint64_t>(iov_addr + i * 16 + 8);
            if (len > 0) {
                std::vector<uint8_t> buf(len);
                size_t bytes_read = 0;
                for (size_t j = 0; j < len; j++) {
                    int ch = EM_ASM_INT({
                        if (Module._stdinBuffer && Module._stdinBuffer.length > 0) {
                            return Module._stdinBuffer.shift();
                        }
                        return -1;
                    });
                    if (ch < 0) break;
                    buf[bytes_read++] = (uint8_t)ch;
                }
                if (bytes_read > 0) {
                    m.memory.memcpy(base, buf.data(), bytes_read);
                    total += bytes_read;
                }
                if (bytes_read < len) break;  // Short read
            }
        }
        m.set_result(total);
#else
        m.set_result(0);  // EOF for stdin
#endif
        return;
    }

    size_t total = 0;
    for (int i = 0; i < iovcnt; i++) {
        uint64_t base = m.memory.template read<uint64_t>(iov_addr + i * 16);
        uint64_t len = m.memory.template read<uint64_t>(iov_addr + i * 16 + 8);
        if (len > 0) {
            std::vector<uint8_t> buf(len);
            ssize_t n = fs.read(fd, buf.data(), len);
            if (n < 0) {
                m.set_result(total > 0 ? (int64_t)total : n);
                return;
            }
            if (n > 0) {
                m.memory.memcpy(base, buf.data(), n);
                total += n;
            }
            if (static_cast<size_t>(n) < len) break;  // Short read
        }
    }
    m.set_result(total);
}

static void sys_pread64(Machine& m) {
    auto& fs = get_fs(m);
    int fd = m.template sysarg<int>(0);
    auto buf_addr = m.sysarg(1);
    size_t count = m.sysarg(2);
    uint64_t offset = m.sysarg(3);

    std::vector<uint8_t> buf(count);
    ssize_t n = fs.pread(fd, buf.data(), count, offset);
    if (n > 0) {
        m.memory.memcpy(buf_addr, buf.data(), n);
    }
    m.set_result(n);
}

static void sys_pwrite64(Machine& m) {
    auto& fs = get_fs(m);
    int fd = m.template sysarg<int>(0);
    auto buf_addr = m.sysarg(1);
    size_t count = m.sysarg(2);
    uint64_t offset = m.sysarg(3);

    std::vector<uint8_t> buf(count);
    m.memory.memcpy_out(buf.data(), buf_addr, count);
    ssize_t n = fs.pwrite(fd, buf.data(), count, offset);
    m.set_result(n);
}

static void sys_ftruncate(Machine& m) {
    auto& fs = get_fs(m);
    int fd = m.template sysarg<int>(0);
    uint64_t length = m.sysarg(1);
    m.set_result(fs.ftruncate(fd, length));
}

static void sys_mkdirat(Machine& m) {
    auto& fs = get_fs(m);
    int dirfd = m.template sysarg<int>(0);
    auto path_addr = m.sysarg(1);
    uint32_t mode = m.template sysarg<uint32_t>(2);

    if (dirfd != AT_FDCWD) {
        m.set_result(err::NOTSUP);
        return;
    }

    std::string path;
    try { path = m.memory.memstring(path_addr); }
    catch (...) { m.set_result(err::INVAL); return; }

    m.set_result(fs.mkdir(path, mode));
}

static void sys_unlinkat(Machine& m) {
    auto& fs = get_fs(m);
    int dirfd = m.template sysarg<int>(0);
    auto path_addr = m.sysarg(1);
    int flags = m.template sysarg<int>(2);

    if (dirfd != AT_FDCWD) {
        m.set_result(err::NOTSUP);
        return;
    }

    std::string path;
    try { path = m.memory.memstring(path_addr); }
    catch (...) { m.set_result(err::INVAL); return; }

    m.set_result(fs.unlink(path, flags));
}

static void sys_symlinkat(Machine& m) {
    auto& fs = get_fs(m);
    auto target_addr = m.sysarg(0);
    int newdirfd = m.template sysarg<int>(1);
    auto linkpath_addr = m.sysarg(2);

    if (newdirfd != AT_FDCWD) {
        m.set_result(err::NOTSUP);
        return;
    }

    std::string target, linkpath;
    try {
        target = m.memory.memstring(target_addr);
        linkpath = m.memory.memstring(linkpath_addr);
    } catch (...) { m.set_result(err::INVAL); return; }

    m.set_result(fs.symlink(target, linkpath));
}

static void sys_linkat(Machine& m) {
    auto& fs = get_fs(m);
    int olddirfd = m.template sysarg<int>(0);
    auto oldpath_addr = m.sysarg(1);
    int newdirfd = m.template sysarg<int>(2);
    auto newpath_addr = m.sysarg(3);

    if (olddirfd != AT_FDCWD || newdirfd != AT_FDCWD) {
        m.set_result(err::NOTSUP);
        return;
    }

    std::string oldpath, newpath;
    try {
        oldpath = m.memory.memstring(oldpath_addr);
        newpath = m.memory.memstring(newpath_addr);
    } catch (...) { m.set_result(err::INVAL); return; }

    m.set_result(fs.link(oldpath, newpath));
}

static void sys_renameat(Machine& m) {
    auto& fs = get_fs(m);
    int olddirfd = m.template sysarg<int>(0);
    auto oldpath_addr = m.sysarg(1);
    int newdirfd = m.template sysarg<int>(2);
    auto newpath_addr = m.sysarg(3);

    if (olddirfd != AT_FDCWD || newdirfd != AT_FDCWD) {
        m.set_result(err::NOTSUP);
        return;
    }

    std::string oldpath, newpath;
    try {
        oldpath = m.memory.memstring(oldpath_addr);
        newpath = m.memory.memstring(newpath_addr);
    } catch (...) { m.set_result(err::INVAL); return; }

    m.set_result(fs.rename(oldpath, newpath));
}

static void sys_sysinfo(Machine& m) {
    auto info_addr = m.sysarg(0);

    // Linux sysinfo structure (64-bit)
    struct linux_sysinfo {
        int64_t  uptime;
        uint64_t loads[3];
        uint64_t totalram;
        uint64_t freeram;
        uint64_t sharedram;
        uint64_t bufferram;
        uint64_t totalswap;
        uint64_t freeswap;
        uint16_t procs;
        uint16_t pad;
        uint32_t pad2;
        uint64_t totalhigh;
        uint64_t freehigh;
        uint32_t mem_unit;
    };

    linux_sysinfo si = {};
    si.uptime = 100;
    si.totalram = 256ULL * 1024 * 1024;  // 256MB
    si.freeram = 128ULL * 1024 * 1024;   // 128MB
    si.procs = 1;
    si.mem_unit = 1;

    m.memory.memcpy(info_addr, &si, sizeof(si));
    m.set_result(0);
}

}  // namespace handlers

// Install all syscall handlers
inline void install_syscalls(Machine& machine, vfs::VirtualFS& fs) {
    // Create and store context
    static SyscallContext ctx(&fs);
    machine.set_userdata(&ctx);

    // Install handlers
    using namespace handlers;
    machine.install_syscall_handler(nr::exit, sys_exit);
    machine.install_syscall_handler(nr::exit_group, sys_exit);
    machine.install_syscall_handler(nr::openat, sys_openat);
    machine.install_syscall_handler(nr::close, sys_close);
    machine.install_syscall_handler(nr::read, sys_read);
    machine.install_syscall_handler(nr::write, sys_write);
    machine.install_syscall_handler(nr::writev, sys_writev);
    machine.install_syscall_handler(nr::lseek, sys_lseek);
    machine.install_syscall_handler(nr::getdents64, sys_getdents64);
    machine.install_syscall_handler(nr::newfstatat, sys_newfstatat);
    machine.install_syscall_handler(nr::fstat, sys_fstat);
    machine.install_syscall_handler(nr::readlinkat, sys_readlinkat);
    machine.install_syscall_handler(nr::getcwd, sys_getcwd);
    machine.install_syscall_handler(nr::chdir, sys_chdir);
    machine.install_syscall_handler(nr::faccessat, sys_faccessat);
    machine.install_syscall_handler(nr::getpid, sys_getpid);
    machine.install_syscall_handler(nr::getppid, sys_getppid);
    machine.install_syscall_handler(nr::gettid, sys_gettid);
    machine.install_syscall_handler(nr::getuid, sys_getuid);
    machine.install_syscall_handler(nr::geteuid, sys_geteuid);
    machine.install_syscall_handler(nr::getgid, sys_getgid);
    machine.install_syscall_handler(nr::getegid, sys_getegid);
    machine.install_syscall_handler(nr::set_tid_address, sys_set_tid_address);
    machine.install_syscall_handler(nr::clock_gettime, sys_clock_gettime);
    machine.install_syscall_handler(nr::getrandom, sys_getrandom);
    // brk, mmap, munmap, mprotect: handled by libriscv (do not override)
    machine.install_syscall_handler(nr::sigaction, sys_sigaction);
    machine.install_syscall_handler(nr::sigprocmask, sys_sigprocmask);
    machine.install_syscall_handler(nr::prlimit64, sys_prlimit64);
    machine.install_syscall_handler(nr::rseq, sys_rseq);
    machine.install_syscall_handler(nr::ioctl, sys_ioctl);
    machine.install_syscall_handler(nr::fcntl, sys_fcntl);
    machine.install_syscall_handler(nr::dup, sys_dup);
    machine.install_syscall_handler(nr::dup3, sys_dup3);
    machine.install_syscall_handler(nr::pipe2, sys_pipe2);
    machine.install_syscall_handler(nr::readv, sys_readv);
    machine.install_syscall_handler(nr::sendfile, sys_sendfile);
    machine.install_syscall_handler(nr::pread64, sys_pread64);
    machine.install_syscall_handler(nr::pwrite64, sys_pwrite64);
    machine.install_syscall_handler(nr::ftruncate, sys_ftruncate);
    machine.install_syscall_handler(nr::mkdirat, sys_mkdirat);
    machine.install_syscall_handler(nr::unlinkat, sys_unlinkat);
    machine.install_syscall_handler(nr::symlinkat, sys_symlinkat);
    machine.install_syscall_handler(nr::linkat, sys_linkat);
    machine.install_syscall_handler(nr::renameat, sys_renameat);
    machine.install_syscall_handler(nr::sysinfo, sys_sysinfo);
}

}  // namespace syscalls
