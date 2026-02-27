#ifndef LIBRISCV_SETTINGS_H
#define LIBRISCV_SETTINGS_H

/*
 * These values are automatically set according to their cmake variables.
 */
/* #undef RISCV_DEBUG */
#define RISCV_EXT_A
#define RISCV_EXT_C
/* #undef RISCV_EXT_V */
/* #undef RISCV_32I */
#define RISCV_64I
/* #undef RISCV_128I */
/* #undef RISCV_FCSR */
#define RISCV_EXPERIMENTAL
/* #undef RISCV_MEMORY_TRAPS */
/* #undef RISCV_MULTIPROCESS */
/* #undef RISCV_BINARY_TRANSLATION */
#define RISCV_FLAT_RW_ARENA
#define RISCV_ENCOMPASSING_ARENA
/* #undef RISCV_THREADED */
#define RISCV_TAILCALL_DISPATCH
/* #undef RISCV_LIBTCC */

/*
 * Version information.
 */
#define RISCV_VERSION_MAJOR 1
#define RISCV_VERSION_MINOR 11

#endif /* LIBRISCV_SETTINGS_H */
