/* Derived from musl 1.2.6 src/ctype/isalpha.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: the locale_t variant and its alias are removed. */
#include <ctype.h>
#undef isalpha

int isalpha(int c)
{
	return ((unsigned)c|32)-'a' < 26;
}
