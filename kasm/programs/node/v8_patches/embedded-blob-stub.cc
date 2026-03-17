// Embedded blob stub for V8
// V8's snapshot/embedded blob is the pre-compiled bytecode for builtins.
// For the first build, this is empty - V8 will use --no-snapshot mode
// (slower startup, but functional). V8 will generate builtins from source at runtime.

#include <cstdint>

extern "C" {
    const uint8_t v8_Default_embedded_blob_code_[] = {0};
    uint32_t v8_Default_embedded_blob_code_size_ = 0;
    const uint8_t v8_Default_embedded_blob_data_[] = {0};
    uint32_t v8_Default_embedded_blob_data_size_ = 0;
    const uint8_t v8_Default_embedded_blob_metadata_[] = {0};
    uint32_t v8_Default_embedded_blob_metadata_size_ = 0;
}
