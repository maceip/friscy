// vhfetch.c - Raw host-fetch bridge for guest userspace.
//
// Reads a JSON request from stdin and forwards it to syscall 500.
// Writes the raw JSON response to stdout.
//
// Request format:
//   {"url":"https://...","options":{"method":"POST","headers":{...},"body":"..."}}
//
// Response format (from host):
//   {"status":200,"statusText":"OK","headers":{...},"body":"..."}

#define _GNU_SOURCE
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/syscall.h>
#include <unistd.h>

#ifndef SYS_host_fetch
#define SYS_host_fetch 500
#endif

static int read_stdin_all(char** out_buf, size_t* out_len) {
    size_t cap = 64 * 1024;
    size_t len = 0;
    char* buf = (char*)malloc(cap);
    if (!buf) return -1;

    while (1) {
        if (len == cap) {
            size_t next_cap = cap * 2;
            char* next = (char*)realloc(buf, next_cap);
            if (!next) {
                free(buf);
                return -1;
            }
            buf = next;
            cap = next_cap;
        }
        ssize_t n = read(STDIN_FILENO, buf + len, cap - len);
        if (n == 0) break;
        if (n < 0) {
            if (errno == EINTR) continue;
            free(buf);
            return -1;
        }
        len += (size_t)n;
    }

    *out_buf = buf;
    *out_len = len;
    return 0;
}

int main(void) {
    char* req = NULL;
    size_t req_len = 0;
    if (read_stdin_all(&req, &req_len) != 0 || req_len == 0) {
        fprintf(stderr, "vhfetch: failed to read request JSON from stdin\n");
        free(req);
        return 2;
    }

    size_t resp_cap = 16 * 1024 * 1024;
    char* resp = (char*)malloc(resp_cap);
    if (!resp) {
        fprintf(stderr, "vhfetch: out of memory\n");
        free(req);
        return 2;
    }

    long n = syscall(SYS_host_fetch, req, req_len, resp, resp_cap);
    free(req);
    if (n < 0) {
        fprintf(stderr, "vhfetch: host_fetch syscall failed (%ld)\n", n);
        free(resp);
        return 7;
    }

    size_t to_write = (size_t)n;
    size_t off = 0;
    while (off < to_write) {
        ssize_t w = write(STDOUT_FILENO, resp + off, to_write - off);
        if (w < 0) {
            if (errno == EINTR) continue;
            fprintf(stderr, "vhfetch: write failed\n");
            free(resp);
            return 3;
        }
        off += (size_t)w;
    }

    free(resp);
    return 0;
}
