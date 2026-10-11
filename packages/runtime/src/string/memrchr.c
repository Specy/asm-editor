/* Derived from musl 1.2.6 src/string/memrchr.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: only the internal name __memrchr is defined (no memrchr alias). */
#include <string.h>

void *__memrchr(const void *m, int c, size_t n)
{
	const unsigned char *s = m;
	c = (unsigned char)c;
	while (n--) if (s[n]==c) return (void *)(s+n);
	return 0;
}
