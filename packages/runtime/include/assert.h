/* Runtime library, ABI v1: <assert.h>. Deliberately has no include guard: each inclusion re-reads NDEBUG. */
#undef assert
#ifdef NDEBUG
#define assert(expr) ((void)0)
#else
#define assert(expr) ((void)((expr) || (__assert_fail(#expr, __FILE__, __LINE__, __func__), 0)))
#endif

#ifndef _ASSERT_H
#define _ASSERT_H

#if !defined(__cplusplus) && !defined(static_assert)
#define static_assert _Static_assert
#endif

#ifdef __cplusplus
extern "C" {
#endif

/** Prints "Assertion failed: expr (file: func: line)" to stderr and aborts; called by the assert macro. */
__attribute__((__noreturn__)) void __assert_fail(const char *expr, const char *file, int line, const char *func);

#ifdef __cplusplus
}
#endif

#endif
