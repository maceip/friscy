// Adapted from Multi-V-VM/node-wasix32 for EdgeJS Emscripten build
#ifndef WASI_SIMDUTF_COMPAT_H_
#define WASI_SIMDUTF_COMPAT_H_

#if defined(__wasi__) || defined(__EMSCRIPTEN__)

#include <cstddef>
#include <cstdint>

namespace simdutf {

enum error_code {
  SUCCESS = 0,
  INVALID_BASE64_CHARACTER = 1,
  BASE64_INPUT_REMAINDER = 2,
};

struct result {
  error_code error;
  size_t count;

  result() : error(SUCCESS), count(0) {}
  result(error_code e, size_t c) : error(e), count(c) {}
};

struct result_with_error {
  error_code error;
  size_t count;
  size_t output_count;

  result_with_error() : error(SUCCESS), count(0), output_count(0) {}
  result_with_error(error_code e, size_t c, size_t oc)
      : error(e), count(c), output_count(oc) {}
};

enum base64_type {
  standard = 0,
  url_safe = 1,
};

// base64_to_binary overloads
inline result base64_to_binary(const char* input, size_t length,
                               char* output, base64_type type = standard) {
  (void)input; (void)length; (void)output; (void)type;
  return result(SUCCESS, 0);
}

inline result base64_to_binary(const char16_t* input, size_t length,
                               char* output, base64_type type = standard) {
  (void)input; (void)length; (void)output; (void)type;
  return result(SUCCESS, 0);
}

// convert_latin1_to_utf8_safe
inline size_t convert_latin1_to_utf8_safe(const char* input, size_t length,
                                          char* output, size_t output_length) {
  size_t j = 0;
  for (size_t i = 0; i < length && j < output_length; i++) {
    unsigned char c = static_cast<unsigned char>(input[i]);
    if (c < 0x80) {
      output[j++] = static_cast<char>(c);
    } else if (j + 1 < output_length) {
      output[j++] = static_cast<char>(0xC0 | (c >> 6));
      output[j++] = static_cast<char>(0x80 | (c & 0x3F));
    } else {
      break;
    }
  }
  return j;
}

}  // namespace simdutf

#endif  // defined(__wasi__) || defined(__EMSCRIPTEN__)
#endif  // WASI_SIMDUTF_COMPAT_H_
