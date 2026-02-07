// test_http_minimal.c - Minimal HTTP test without libc
//
// Compile: riscv64-linux-gnu-gcc -nostdlib -static -O2 -o test_http_minimal test_http_minimal.c
//
// This is a minimal HTTP client that doesn't use glibc, avoiding TLS issues.

typedef unsigned long size_t;
typedef long ssize_t;
typedef unsigned int uint32_t;
typedef unsigned short uint16_t;
typedef unsigned char uint8_t;

// Syscall numbers for RISC-V 64
#define SYS_write    64
#define SYS_exit     93
#define SYS_socket   198
#define SYS_connect  203
#define SYS_sendto   206
#define SYS_recvfrom 207
#define SYS_close    57

// Socket constants
#define AF_INET      2
#define SOCK_STREAM  1

// sockaddr_in structure
struct sockaddr_in {
    uint16_t sin_family;
    uint16_t sin_port;
    uint32_t sin_addr;
    char     sin_zero[8];
};

// Raw syscall wrapper
static inline long syscall6(long n, long a, long b, long c, long d, long e, long f) {
    register long a0 __asm__("a0") = a;
    register long a1 __asm__("a1") = b;
    register long a2 __asm__("a2") = c;
    register long a3 __asm__("a3") = d;
    register long a4 __asm__("a4") = e;
    register long a5 __asm__("a5") = f;
    register long a7 __asm__("a7") = n;
    __asm__ volatile("ecall"
                     : "+r"(a0)
                     : "r"(a1), "r"(a2), "r"(a3), "r"(a4), "r"(a5), "r"(a7)
                     : "memory");
    return a0;
}

#define syscall1(n, a)             syscall6(n, a, 0, 0, 0, 0, 0)
#define syscall2(n, a, b)          syscall6(n, a, b, 0, 0, 0, 0)
#define syscall3(n, a, b, c)       syscall6(n, a, b, c, 0, 0, 0)
#define syscall4(n, a, b, c, d)    syscall6(n, a, b, c, d, 0, 0)

static size_t strlen(const char* s) {
    size_t len = 0;
    while (*s++) len++;
    return len;
}

static void* memset(void* s, int c, size_t n) {
    char* p = s;
    while (n--) *p++ = c;
    return s;
}

static void* memcpy(void* dest, const void* src, size_t n) {
    char* d = dest;
    const char* s = src;
    while (n--) *d++ = *s++;
    return dest;
}

static void print(const char* s) {
    syscall3(SYS_write, 1, (long)s, strlen(s));
}

static void print_int(long n) {
    char buf[32];
    char* p = buf + sizeof(buf) - 1;
    *p = '\0';

    int neg = 0;
    if (n < 0) {
        neg = 1;
        n = -n;
    }

    do {
        *--p = '0' + (n % 10);
        n /= 10;
    } while (n > 0);

    if (neg) *--p = '-';
    print(p);
}

// Convert host to network byte order (16-bit)
static uint16_t htons(uint16_t n) {
    return ((n & 0xFF) << 8) | ((n >> 8) & 0xFF);
}

// Entry point (no libc, so we use _start directly)
void _start(void) {
    print("=== friscy HTTP Test (minimal) ===\n\n");

    // Connect to localhost:8080
    const char* host_ip = "127.0.0.1";
    int port = 8080;

    print("Target: ");
    print(host_ip);
    print(":");
    print_int(port);
    print("\n\n");

    // Create socket
    print("1. socket()... ");
    int fd = syscall3(SYS_socket, AF_INET, SOCK_STREAM, 0);
    if (fd < 0) {
        print("FAILED (");
        print_int(fd);
        print(")\n");
        syscall1(SYS_exit, 1);
    }
    print("fd=");
    print_int(fd);
    print("\n");

    // Connect
    print("2. connect()... ");
    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port = htons(port);
    // 127.0.0.1 in network byte order
    addr.sin_addr = (127) | (0 << 8) | (0 << 16) | (1 << 24);

    int ret = syscall3(SYS_connect, fd, (long)&addr, sizeof(addr));
    if (ret < 0 && ret != -115) {  // -115 is EINPROGRESS
        print("FAILED (");
        print_int(ret);
        print(")\n");
        syscall1(SYS_exit, 1);
    }
    print("OK\n");

    // Send HTTP request
    print("3. send()... ");
    const char* request =
        "GET /test HTTP/1.0\r\n"
        "Host: 127.0.0.1\r\n"
        "Connection: close\r\n"
        "\r\n";
    size_t reqlen = strlen(request);

    ret = syscall4(SYS_sendto, fd, (long)request, reqlen, 0);
    if (ret < 0) {
        print("FAILED (");
        print_int(ret);
        print(")\n");
        syscall1(SYS_exit, 1);
    }
    print_int(ret);
    print(" bytes sent\n");

    // Receive response
    print("4. recv()...\n\n");
    print("--- HTTP Response ---\n");

    char buf[4096];
    int total = 0;

    while (1) {
        ret = syscall6(SYS_recvfrom, fd, (long)buf, sizeof(buf) - 1, 0, 0, 0);
        if (ret > 0) {
            buf[ret] = '\0';
            syscall3(SYS_write, 1, (long)buf, ret);
            total += ret;
        } else if (ret == 0) {
            // Connection closed
            break;
        } else if (ret == -11) {
            // EAGAIN - try again (shouldn't happen in blocking mode)
            break;
        } else {
            print("\n[recv error: ");
            print_int(ret);
            print("]\n");
            break;
        }
    }

    print("\n--- End Response ---\n\n");
    print("Total: ");
    print_int(total);
    print(" bytes\n");

    // Close
    print("5. close()... ");
    syscall1(SYS_close, fd);
    print("OK\n");

    print("\n=== Test PASSED ===\n");
    syscall1(SYS_exit, 0);
}
