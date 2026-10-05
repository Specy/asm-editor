/* Derived from musl 1.2.6 src/stdio/fputs.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: the fputs_unlocked alias is removed. */
#include "stdio_impl.h"
#include <string.h>

int fputs(const char *restrict s, FILE *restrict f)
{
	size_t l = strlen(s);
	return (fwrite(s, 1, l, f)==l) - 1;
}
