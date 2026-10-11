/* Derived from musl 1.2.6 src/ctype/toupper.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: the locale_t variant and its alias are removed. */
#include <ctype.h>

int toupper(int c)
{
	if (islower(c)) return c & 0x5f;
	return c;
}
