#!/bin/sh
cat <<'C_EOF' > /export_helper.c
#define _GNU_SOURCE
#include <unistd.h>
#include <sys/syscall.h>

int main() {
    syscall(610);
    return 0;
}
C_EOF
apk add gcc musl-dev
gcc -static -o /export_helper /export_helper.c
