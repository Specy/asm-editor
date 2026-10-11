/* Derived from musl 1.2.6 src/ctype/isdigit.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: the locale_t variant and its alias are removed. */
#include <ctype.h>
#undef isdigit

int isdigit(int c)
{
	return (unsigned)c-'0' < 10;
}
