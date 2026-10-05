/* Derived from musl 1.2.6 src/ctype/isblank.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: the locale_t variant and its alias are removed. */
#include <ctype.h>

int isblank(int c)
{
	return (c == ' ' || c == '\t');
}
