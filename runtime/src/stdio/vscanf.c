/* Derived from musl 1.2.6 src/stdio/vscanf.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: the __isoc99 alias is removed. */
#include <stdio.h>
#include <stdarg.h>

int vscanf(const char *restrict fmt, va_list ap)
{
	return vfscanf(stdin, fmt, ap);
}
