/* Derived from musl 1.2.6 src/ctype/isgraph.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: the locale_t variant and its alias are removed. */
#include <ctype.h>
#undef isgraph

int isgraph(int c)
{
	return (unsigned)c-0x21 < 0x5e;
}
