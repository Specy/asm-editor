/* Derived from musl 1.2.6 src/string/strcpy.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: declares the internal __stpcpy itself. */
#include <string.h>

char *__stpcpy(char *, const char *);

char *strcpy(char *restrict dest, const char *restrict src)
{
	__stpcpy(dest, src);
	return dest;
}
