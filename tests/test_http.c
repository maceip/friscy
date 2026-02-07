// test_http.c - Test HTTP fetch from RISC-V guest
//
// Compile: riscv64-linux-gnu-gcc -static -O2 -o test_http test_http.c
// Run: ./friscy test_http
//
// This makes an HTTP GET request to demonstrate socket syscalls work.

#include <stdint.h>
#include <string.h>

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

// Convert dotted IP to network byte order
static uint32_t inet_addr(const char* ip) {
    uint32_t addr = 0;
    int shift = 0;
    int val = 0;

    for (const char* p = ip; ; p++) {
        if (*p >= '0' && *p <= '9') {
            val = val * 10 + (*p - '0');
        } else {
            addr |= (val << shift);
            shift += 8;
            val = 0;
            if (*p == '\0') break;
        }
    }
    return addr;
}

// Convert host to network byte order (16-bit)
static uint16_t htons(uint16_t n) {
    return ((n & 0xFF) << 8) | ((n >> 8) & 0xFF);
}

int main(int argc, char** argv) {
    print("=== friscy HTTP Test ===\n\n");

    // Default: connect to localhost:8080
    const char* host_ip = "127.0.0.1";
    int port = 8080;
    const char* path = "/";

    if (argc > 1) host_ip = argv[1];
    if (argc > 2) {
        port = 0;
        for (const char* p = argv[2]; *p >= '0' && *p <= '9'; p++) {
            port = port * 10 + (*p - '0');
        }
    }
    if (argc > 3) path = argv[3];

    print("Connecting to ");
    print(host_ip);
    print(":");
    print_int(port);
    print(path);
    print("\n\n");

    // Create socket
    print("1. Creating socket... ");
    int fd = syscall3(SYS_socket, AF_INET, SOCK_STREAM, 0);
    if (fd < 0) {
        print("FAILED (");
        print_int(fd);
        print(")\n");
        syscall1(SYS_exit, 1);
    }
    print("OK (fd=");
    print_int(fd);
    print(")\n");

    // Connect
    print("2. Connecting... ");
    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port = htons(port);
    addr.sin_addr = inet_addr(host_ip);

    int ret = syscall3(SYS_connect, fd, (long)&addr, sizeof(addr));
    // EINPROGRESS (-115) is OK for async connects
    if (ret < 0 && ret != -115) {
        print("FAILED (");
        print_int(ret);
        print(")\n");
        syscall1(SYS_exit, 1);
    }
    print("OK");
    if (ret == -115) print(" (in progress)");
    print("\n");

    // Build HTTP request
    char request[512];
    char* p = request;

    // GET /path HTTP/1.0\r\n
    memcpy(p, "GET ", 4); p += 4;
    int pathlen = strlen(path);
    memcpy(p, path, pathlen); p += pathlen;
    memcpy(p, " HTTP/1.0\r\n", 11); p += 11;

    // Host header
    memcpy(p, "Host: ", 6); p += 6;
    int hostlen = strlen(host_ip);
    memcpy(p, host_ip, hostlen); p += hostlen;
    memcpy(p, "\r\n", 2); p += 2;

    // Connection: close
    memcpy(p, "Connection: close\r\n", 19); p += 19;

    // End headers
    memcpy(p, "\r\n", 2); p += 2;
    *p = '\0';

    int reqlen = p - request;

    // Send request
    print("3. Sending HTTP request (");
    print_int(reqlen);
    print(" bytes)... ");

    ret = syscall4(SYS_sendto, fd, (long)request, reqlen, 0);
    if (ret < 0) {
        print("FAILED (");
        print_int(ret);
        print(")\n");
        syscall1(SYS_exit, 1);
    }
    print("OK (sent ");
    print_int(ret);
    print(" bytes)\n");

    // Receive response
    print("4. Receiving response...\n\n");
    print("--- Response Start ---\n");

    char buf[4096];
    int total = 0;
    int attempts = 0;

    while (attempts < 100) {  // Limit attempts to avoid infinite loop
        ret = syscall6(SYS_recvfrom, fd, (long)buf, sizeof(buf) - 1, 0, 0, 0);

        if (ret > 0) {
            buf[ret] = '\0';
            syscall3(SYS_write, 1, (long)buf, ret);
            total += ret;
            attempts = 0;  // Reset on successful read
        } else if (ret == 0) {
            // Connection closed
            break;
        } else if (ret == -11) {
            // EAGAIN - no data yet, keep trying
            attempts++;
            // Small delay (busy wait)
            for (volatile int i = 0; i < 100000; i++);
        } else {
            // Error
            print("\n[recv error: ");
            print_int(ret);
            print("]\n");
            break;
        }
    }

    print("\n--- Response End ---\n\n");
    print("Total received: ");
    print_int(total);
    print(" bytes\n");

    // Close socket
    print("5. Closing socket... ");
    syscall1(SYS_close, fd);
    print("OK\n");

    print("\n=== Test Complete ===\n");
    syscall1(SYS_exit, 0);
    return 0;
}
