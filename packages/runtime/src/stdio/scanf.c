/* Derived from musl 1.2.6 src/stdio/scanf.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: the __isoc99 alias is removed. */
#include <stdio.h>
#include <stdarg.h>

int scanf(const char *restrict fmt, ...)
{
	int ret;
	va_list ap;
	va_start(ap, fmt);
	ret = vscanf(fmt, ap);
	va_end(ap);
	return ret;
}
