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
        m.set_result(0);  // EOF for stdin
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
    int fd = m.template sysarg<int>(0);
    auto buf_addr = m.sysarg(1);
    size_t count = m.sysarg(2);

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
    m.set_result(err::BADF);
}

static void sys_writev(Machine& m) {
    int fd = m.template sysarg<int>(0);
    auto iov_addr = m.sysarg(1);
    int iovcnt = m.template sysarg<int>(2);

    if (fd != 1 && fd != 2) {
        m.set_result(err::BADF);
        return;
    }

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
    int fd = m.template sysarg<int>(0);
    auto statbuf_addr = m.sysarg(1);

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

static void sys_brk(Machine& m) { m.set_result(0); }
static void sys_mmap(Machine& m) { m.set_result(-12); }  // ENOMEM
static void sys_munmap(Machine& m) { m.set_result(0); }
static void sys_mprotect(Machine& m) { m.set_result(0); }
static void sys_sigaction(Machine& m) { m.set_result(0); }
static void sys_sigprocmask(Machine& m) { m.set_result(0); }
static void sys_prlimit64(Machine& m) { m.set_result(0); }
static void sys_rseq(Machine& m) { m.set_result(err::NOSYS); }

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

static void sys_dup(Machine& m) { m.set_result(err::NOSYS); }
static void sys_dup3(Machine& m) { m.set_result(err::NOSYS); }
static void sys_pipe2(Machine& m) { m.set_result(err::NOSYS); }

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
    machine.install_syscall_handler(nr::brk, sys_brk);
    machine.install_syscall_handler(nr::mmap, sys_mmap);
    machine.install_syscall_handler(nr::munmap, sys_munmap);
    machine.install_syscall_handler(nr::mprotect, sys_mprotect);
    machine.install_syscall_handler(nr::sigaction, sys_sigaction);
    machine.install_syscall_handler(nr::sigprocmask, sys_sigprocmask);
    machine.install_syscall_handler(nr::prlimit64, sys_prlimit64);
    machine.install_syscall_handler(nr::rseq, sys_rseq);
    machine.install_syscall_handler(nr::ioctl, sys_ioctl);
    machine.install_syscall_handler(nr::fcntl, sys_fcntl);
    machine.install_syscall_handler(nr::dup, sys_dup);
    machine.install_syscall_handler(nr::dup3, sys_dup3);
    machine.install_syscall_handler(nr::pipe2, sys_pipe2);
}

}  // namespace syscalls
