/* Derived from musl 1.2.6 src/stdio/vprintf.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: includes <stdarg.h> for va_list (this library's <stdio.h> does not define it). */
#include <stdio.h>
#include <stdarg.h>

int vprintf(const char *restrict fmt, va_list ap)
{
	return vfprintf(stdout, fmt, ap);
}
