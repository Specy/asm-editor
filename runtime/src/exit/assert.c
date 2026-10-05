/* Derived from musl 1.2.6 src/exit/assert.c (MIT, see runtime/third_party/musl/COPYRIGHT). Unchanged apart from this comment. */
#include <stdio.h>
#include <stdlib.h>

_Noreturn void __assert_fail(const char *expr, const char *file, int line, const char *func)
{
	fprintf(stderr, "Assertion failed: %s (%s: %s: %d)\n", expr, file, func, line);
	abort();
}
