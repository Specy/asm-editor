/* Derived from musl 1.2.6 src/string/bcmp.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: declared here, since the library has no <strings.h>. No program names it: Clang calls it for a memcmp
 * whose result is only compared with zero. */
#include <string.h>

int bcmp(const void *s1, const void *s2, size_t n);

int bcmp(const void *s1, const void *s2, size_t n)
{
	return memcmp(s1, s2, n);
}
