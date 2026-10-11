/* Derived from musl 1.2.6 src/ctype/isspace.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: the locale_t variant and its alias are removed. */
#include <ctype.h>
#undef isspace

int isspace(int c)
{
	return c == ' ' || (unsigned)c-'\t' < 5;
}
