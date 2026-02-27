// vhsh.c - Minimal stdin-driven command loop for friscy demos.
//
// Avoids interactive TTY control sequences and reads stdin byte-wise so it
// works with the worker SAB stdin path deterministically.

#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/wait.h>
#include <unistd.h>

static int run_line(const char* line) {
    pid_t pid = fork();
    if (pid < 0) return -1;
    if (pid == 0) {
        execl("/bin/sh", "sh", "-lc", line, (char*)NULL);
        _exit(127);
    }
    int status = 0;
    while (waitpid(pid, &status, 0) < 0) {
        if (errno == EINTR) continue;
        return -1;
    }
    return status;
}

int main(void) {
    char line[4096];
    size_t len = 0;
    const char* prompt = "/ # ";
    write(1, prompt, strlen(prompt));

    while (1) {
        char c = 0;
        ssize_t n = read(0, &c, 1);
        if (n == 0) break; // EOF
        if (n < 0) {
            if (errno == EINTR) continue;
            break;
        }
        if (c == '\r') continue;
        if (c != '\n') {
            if (len + 1 < sizeof(line)) {
                line[len++] = c;
            }
            continue;
        }

        line[len] = '\0';
        if (len > 0) {
            run_line(line);
        }
        len = 0;
        write(1, prompt, strlen(prompt));
    }
    return 0;
}
