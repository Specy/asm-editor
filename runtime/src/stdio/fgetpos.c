/* Derived from musl 1.2.6 src/stdio/fgetpos.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: stores the position in this library's fpos_t. */
#include "stdio_impl.h"

int fgetpos(FILE *restrict f, fpos_t *restrict pos)
{
	off_t off = __ftello(f);
	if (off < 0) return -1;
	pos->__aed_pos = off;
	return 0;
}
