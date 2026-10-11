/* Derived from musl 1.2.6 src/stdio/vsprintf.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: includes <stdarg.h> for va_list (this library's <stdio.h> does not define it). */
#include <stdio.h>
#include <stdarg.h>
#include <limits.h>

int vsprintf(char *restrict s, const char *restrict fmt, va_list ap)
{
	return vsnprintf(s, INT_MAX + 1U, fmt, ap);
}
