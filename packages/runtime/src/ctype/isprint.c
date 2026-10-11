/* Derived from musl 1.2.6 src/ctype/isprint.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: the locale_t variant and its alias are removed. */
#include <ctype.h>
#undef isprint

int isprint(int c)
{
	return (unsigned)c-0x20 < 0x5f;
}
