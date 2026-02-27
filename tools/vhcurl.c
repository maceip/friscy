// vhcurl.c - Minimal curl-compatible host-fetch client for friscy guest.
//
// Uses syscall 500 (host fetch hypercall) to perform HTTPS requests via
// browser/host fetch() without depending on guest TCP/DNS behavior.

#define _GNU_SOURCE
#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/syscall.h>
#include <unistd.h>

#ifndef SYS_host_fetch
#define SYS_host_fetch 500
#endif

static void json_escape(const char* in, char* out, size_t out_cap) {
    size_t w = 0;
    for (size_t i = 0; in[i] && w + 2 < out_cap; i++) {
        unsigned char c = (unsigned char)in[i];
        if (c == '"' || c == '\\') {
            out[w++] = '\\';
            out[w++] = (char)c;
        } else if (c == '\n') {
            out[w++] = '\\';
            out[w++] = 'n';
        } else if (c == '\r') {
            out[w++] = '\\';
            out[w++] = 'r';
        } else if (c == '\t') {
            out[w++] = '\\';
            out[w++] = 't';
        } else if (c < 0x20) {
            // Skip control chars we don't expect in URLs.
        } else {
            out[w++] = (char)c;
        }
    }
    out[w] = '\0';
}

static int parse_status(const char* json) {
    const char* p = strstr(json, "\"status\":");
    if (!p) return 0;
    p += 9;
    while (*p && isspace((unsigned char)*p)) p++;
    return atoi(p);
}

static const char* find_body(const char* json) {
    const char* p = strstr(json, "\"body\":\"");
    if (!p) return NULL;
    return p + 8;
}

static void print_json_string_unescaped(const char* s) {
    for (size_t i = 0; s[i]; i++) {
        char c = s[i];
        if (c == '"') {
            break;
        }
        if (c != '\\') {
            fputc(c, stdout);
            continue;
        }
        char n = s[++i];
        if (!n) break;
        if (n == 'n') fputc('\n', stdout);
        else if (n == 'r') fputc('\r', stdout);
        else if (n == 't') fputc('\t', stdout);
        else if (n == '\\') fputc('\\', stdout);
        else if (n == '"') fputc('"', stdout);
        else if (n == '/') fputc('/', stdout);
        else if (n == 'u') {
            // Minimal handling: skip \uXXXX escape sequence.
            for (int k = 0; k < 4 && s[i + 1]; k++) i++;
        } else {
            fputc(n, stdout);
        }
    }
}

int main(int argc, char** argv) {
    if (argc < 2) {
        fprintf(stderr, "usage: curl <url>\n");
        return 2;
    }

    const char* url = argv[1];
    char escaped[4096];
    json_escape(url, escaped, sizeof(escaped));

    char req[4608];
    int req_len = snprintf(req, sizeof(req),
        "{\"url\":\"%s\",\"options\":{\"method\":\"GET\",\"headers\":{\"accept\":\"*/*\"}}}",
        escaped);
    if (req_len <= 0 || req_len >= (int)sizeof(req)) {
        fprintf(stderr, "vhcurl: request too large\n");
        return 2;
    }

    size_t resp_cap = 8 * 1024 * 1024;
    char* resp = (char*)malloc(resp_cap);
    if (!resp) {
        fprintf(stderr, "vhcurl: out of memory\n");
        return 2;
    }

    long n = syscall(SYS_host_fetch, req, (size_t)req_len, resp, resp_cap - 1);
    if (n < 0) {
        fprintf(stderr, "vhcurl: host_fetch syscall failed (%ld)\n", n);
        free(resp);
        return 7;
    }
    resp[n] = '\0';

    int status = parse_status(resp);
    const char* body = find_body(resp);
    if (body) {
        print_json_string_unescaped(body);
    } else {
        // Fallback to raw JSON if body is missing.
        fputs(resp, stdout);
    }
    if (status >= 400) {
        fprintf(stderr, "\nvhcurl: HTTP %d\n", status);
    }

    free(resp);
    return (status >= 400) ? 22 : 0;
}
