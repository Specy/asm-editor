/* Runtime library, ABI v1: <limits.h>. Values come from GCC's predefined macros (char is unsigned on RISC-V, signed on MIPS). */
#ifndef _LIMITS_H
#define _LIMITS_H

#define CHAR_BIT __CHAR_BIT__
#define MB_LEN_MAX 1

#define SCHAR_MAX __SCHAR_MAX__
#define SCHAR_MIN (-SCHAR_MAX - 1)
#define UCHAR_MAX (SCHAR_MAX * 2 + 1)
#ifdef __CHAR_UNSIGNED__
#define CHAR_MIN 0
#define CHAR_MAX UCHAR_MAX
#else
#define CHAR_MIN SCHAR_MIN
#define CHAR_MAX SCHAR_MAX
#endif

#define SHRT_MAX __SHRT_MAX__
#define SHRT_MIN (-SHRT_MAX - 1)
#define USHRT_MAX (SHRT_MAX * 2 + 1)

#define INT_MAX __INT_MAX__
#define INT_MIN (-INT_MAX - 1)
#define UINT_MAX (INT_MAX * 2U + 1U)

#define LONG_MAX __LONG_MAX__
#define LONG_MIN (-LONG_MAX - 1L)
#define ULONG_MAX (LONG_MAX * 2UL + 1UL)

#define LLONG_MAX __LONG_LONG_MAX__
#define LLONG_MIN (-LLONG_MAX - 1LL)
#define ULLONG_MAX (LLONG_MAX * 2ULL + 1ULL)

#endif
