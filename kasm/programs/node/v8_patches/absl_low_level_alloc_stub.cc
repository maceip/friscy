// Stub implementation of LowLevelAlloc for Emscripten
// Uses regular malloc/free instead of mmap

#include "absl/base/internal/low_level_alloc.h"

#include <cstdlib>

namespace absl {
namespace base_internal {

struct LowLevelAlloc::Arena {
    // Empty arena structure - malloc doesn't need arenas
};

void* LowLevelAlloc::Alloc(size_t size) {
    return std::malloc(size);
}

void* LowLevelAlloc::AllocWithArena(size_t size, Arena* /*arena*/) {
    return std::malloc(size);
}

void LowLevelAlloc::Free(void* p) {
    std::free(p);
}

LowLevelAlloc::Arena* LowLevelAlloc::NewArena(uint32_t /*flags*/) {
    // Return a dummy arena - malloc doesn't need it
    static Arena dummy_arena;
    return &dummy_arena;
}

bool LowLevelAlloc::DeleteArena(Arena* /*arena*/) {
    return true;
}

LowLevelAlloc::Arena* LowLevelAlloc::DefaultArena() {
    static Arena default_arena;
    return &default_arena;
}

} // namespace base_internal
} // namespace absl
