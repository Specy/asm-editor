/* Derived from musl 1.2.6 src/string/strchr.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: declares the internal __strchrnul itself. */
#include <string.h>

char *__strchrnul(const char *, int);

char *strchr(const char *s, int c)
{
	char *r = __strchrnul(s, c);
	return *(unsigned char *)r == (unsigned char)c ? r : 0;
}
