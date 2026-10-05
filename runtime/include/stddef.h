/* Runtime library, ABI v1: <stddef.h>. Types come from GCC's predefined macros, so one header serves ILP32 and LP64 Targets. */
#ifndef _STDDEF_H
#define _STDDEF_H

typedef __SIZE_TYPE__ size_t;
typedef __PTRDIFF_TYPE__ ptrdiff_t;
#ifndef __cplusplus
typedef __WCHAR_TYPE__ wchar_t;
#endif

/* The library never uses long double, so its strictest alignment is that of long long and double: 8 bytes on every Target. */
typedef struct {
	long long __aed_ll __attribute__((__aligned__(__alignof__(long long))));
	double __aed_d __attribute__((__aligned__(__alignof__(double))));
} max_align_t;

#if defined(__cplusplus) && __cplusplus >= 201103L
typedef decltype(nullptr) nullptr_t;
#endif

#ifndef NULL
#ifdef __cplusplus
#define NULL __null
#else
#define NULL ((void *)0)
#endif
#endif

#define offsetof(type, member) __builtin_offsetof(type, member)

#endif
