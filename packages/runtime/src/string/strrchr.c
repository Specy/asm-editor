/* Derived from musl 1.2.6 src/string/strrchr.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: declares the internal __memrchr itself. */
#include <string.h>

void *__memrchr(const void *, int, size_t);

char *strrchr(const char *s, int c)
{
	return __memrchr(s, c, strlen(s) + 1);
}
