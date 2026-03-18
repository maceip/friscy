// Adapted from Multi-V-VM/node-wasix32 for EdgeJS Emscripten build
#ifndef WASI_SIMDUTF_STUBS_H_
#define WASI_SIMDUTF_STUBS_H_

#if defined(__wasi__) || defined(__EMSCRIPTEN__)

#include <cstddef>
#include <cstdint>
#include <cstring>
#include "wasi-simdutf-compat.h"

#ifndef SIMDUTF_VERSION
#define SIMDUTF_VERSION "5.7.0"
#endif

namespace simdutf {

inline bool validate_ascii(const char* input, size_t length) {
  for (size_t i = 0; i < length; i++) {
    if (static_cast<unsigned char>(input[i]) >= 0x80) return false;
  }
  return true;
}

inline bool validate_utf8(const char* input, size_t length) {
  size_t i = 0;
  while (i < length) {
    unsigned char c = static_cast<unsigned char>(input[i]);
    if (c < 0x80) {
      i++;
    } else if ((c & 0xE0) == 0xC0) {
      if (i + 1 >= length) return false;
      if ((input[i + 1] & 0xC0) != 0x80) return false;
      i += 2;
    } else if ((c & 0xF0) == 0xE0) {
      if (i + 2 >= length) return false;
      if ((input[i + 1] & 0xC0) != 0x80) return false;
      if ((input[i + 2] & 0xC0) != 0x80) return false;
      i += 3;
    } else if ((c & 0xF8) == 0xF0) {
      if (i + 3 >= length) return false;
      if ((input[i + 1] & 0xC0) != 0x80) return false;
      if ((input[i + 2] & 0xC0) != 0x80) return false;
      if ((input[i + 3] & 0xC0) != 0x80) return false;
      i += 4;
    } else {
      return false;
    }
  }
  return true;
}

inline result validate_ascii_with_errors(const char* input, size_t length) {
  for (size_t i = 0; i < length; i++) {
    if (static_cast<unsigned char>(input[i]) >= 0x80) {
      return result(INVALID_BASE64_CHARACTER, i);
    }
  }
  return result(SUCCESS, length);
}

inline size_t convert_latin1_to_utf8(const char* input, size_t length,
                                     char* output) {
  size_t j = 0;
  for (size_t i = 0; i < length; i++) {
    unsigned char c = static_cast<unsigned char>(input[i]);
    if (c < 0x80) {
      output[j++] = static_cast<char>(c);
    } else {
      // Encode chars > 0x7F as two-byte UTF-8
      output[j++] = static_cast<char>(0xC0 | (c >> 6));
      output[j++] = static_cast<char>(0x80 | (c & 0x3F));
    }
  }
  return j;
}

inline result base64_to_binary_safe(const char* input, size_t length,
                                    char* output, size_t& outlen,
                                    base64_type type = standard) {
  (void)input; (void)length; (void)output; (void)type;
  outlen = 0;
  return result(SUCCESS, 0);
}

inline result base64_to_binary_safe(const char16_t* input, size_t length,
                                    char* output, size_t& outlen,
                                    base64_type type = standard) {
  (void)input; (void)length; (void)output; (void)type;
  outlen = 0;
  return result(SUCCESS, 0);
}

}  // namespace simdutf

#endif  // defined(__wasi__) || defined(__EMSCRIPTEN__)
#endif  // WASI_SIMDUTF_STUBS_H_
