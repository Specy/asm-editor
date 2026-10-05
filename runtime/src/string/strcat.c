/* Derived from musl 1.2.6 src/string/strcat.c (MIT, see runtime/third_party/musl/COPYRIGHT). Unchanged apart from this comment. */
#include <string.h>

char *strcat(char *restrict dest, const char *restrict src)
{
	strcpy(dest + strlen(dest), src);
	return dest;
}
