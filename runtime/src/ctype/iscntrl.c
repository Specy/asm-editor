/* Derived from musl 1.2.6 src/ctype/iscntrl.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: the locale_t variant and its alias are removed. */
#include <ctype.h>

int iscntrl(int c)
{
	return (unsigned)c < 0x20 || c == 0x7f;
}
