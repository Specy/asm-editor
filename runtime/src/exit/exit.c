/* Derived from musl 1.2.6 src/exit/exit.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: no threads, so no exit lock; no _fini and no stdio flush (every stream writes through). It runs the
 * atexit and __cxa_atexit handlers (atexit.c overrides the weak dummy when linked), then .fini_array, then
 * _Exit. The .fini_array bounds are weak, so exit works in programs that never ran crt0. */
#include <stdlib.h>
#include <stdint.h>
#include "features.h"

static void dummy()
{
}

/* atexit.c overrides this when a program registers a handler. */
weak_alias(dummy, __funcs_on_exit);
weak_alias(dummy, __stdio_exit);

extern weak void (*const __fini_array_start)(void), (*const __fini_array_end)(void);

static void libc_exit_fini(void)
{
	uintptr_t a = (uintptr_t)&__fini_array_end;
	for (; a>(uintptr_t)&__fini_array_start; a-=sizeof(void(*)()))
		(*(void (**)())(a-sizeof(void(*)())))();
}

_Noreturn void exit(int code)
{
	__funcs_on_exit();
	libc_exit_fini();
	__stdio_exit();
	_Exit(code);
}
