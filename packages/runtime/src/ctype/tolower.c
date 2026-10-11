/* Derived from musl 1.2.6 src/ctype/tolower.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: the locale_t variant and its alias are removed. */
#include <ctype.h>

int tolower(int c)
{
	if (isupper(c)) return c | 32;
	return c;
}
