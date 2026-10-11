/* Derived from musl 1.2.6 src/string/strncpy.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: declares the internal __stpncpy itself. */
#include <string.h>

char *__stpncpy(char *, const char *, size_t);

char *strncpy(char *restrict d, const char *restrict s, size_t n)
{
	__stpncpy(d, s, n);
	return d;
}
