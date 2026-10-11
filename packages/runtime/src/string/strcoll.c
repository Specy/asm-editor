/* Derived from musl 1.2.6 src/locale/strcoll.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: only the "C" locale, so strcoll compares with strcmp directly. */
#include <string.h>

int strcoll(const char *l, const char *r)
{
	return strcmp(l, r);
}
