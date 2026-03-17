#include <emscripten.h>
#include <stdint.h>
#include <stddef.h>

void host_get_random(void *buf, size_t len) {
    size_t offset = 0;
    while (offset < len) {
        size_t chunk = len - offset;
        if (chunk > 65536) {
            chunk = 65536; // crypto.getRandomValues max bytes per call
        }
        EM_ASM_({
            const buffer = new Uint8Array(wasmMemory.buffer, $0, $1);
            crypto.getRandomValues(buffer);
        }, (uint8_t *)buf + offset, chunk);
        offset += chunk;
    }
}
