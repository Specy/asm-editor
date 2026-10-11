/* Derived from musl 1.2.6 src/ctype/ispunct.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: the locale_t variant and its alias are removed. */
#include <ctype.h>

int ispunct(int c)
{
	return isgraph(c) && !isalnum(c);
}
