/* Derived from musl 1.2.6 src/locale/strxfrm.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: only the "C" locale, so strxfrm copies by code points directly. */
#include <string.h>

/* collate only by code points */
size_t strxfrm(char *restrict dest, const char *restrict src, size_t n)
{
	size_t l = strlen(src);
	if (n > l) strcpy(dest, src);
	return l;
}
