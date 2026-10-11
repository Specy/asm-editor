/* Derived from musl 1.2.6 src/stdio/puts.c (MIT, see runtime/third_party/musl/COPYRIGHT). Unchanged apart from this comment. */
#include "stdio_impl.h"

int puts(const char *s)
{
	int r;
	FLOCK(stdout);
	r = -(fputs(s, stdout) < 0 || putc_unlocked('\n', stdout) < 0);
	FUNLOCK(stdout);
	return r;
}
