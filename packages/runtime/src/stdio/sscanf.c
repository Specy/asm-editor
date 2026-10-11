/* Derived from musl 1.2.6 src/stdio/sscanf.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: the __isoc99 alias is removed. */
#include <stdio.h>
#include <stdarg.h>

int sscanf(const char *restrict s, const char *restrict fmt, ...)
{
	int ret;
	va_list ap;
	va_start(ap, fmt);
	ret = vsscanf(s, fmt, ap);
	va_end(ap);
	return ret;
}
