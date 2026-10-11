/* Derived from musl 1.2.6 src/string/strndup.c (MIT, see runtime/third_party/musl/COPYRIGHT). Unchanged apart from this comment. */
#include <stdlib.h>
#include <string.h>

char *strndup(const char *s, size_t n)
{
	size_t l = strnlen(s, n);
	char *d = malloc(l+1);
	if (!d) return NULL;
	memcpy(d, s, l);
	d[l] = 0;
	return d;
}
