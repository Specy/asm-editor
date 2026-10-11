/* Derived from musl 1.2.6 src/stdio/fsetpos.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: reads the position from this library's fpos_t. */
#include "stdio_impl.h"

int fsetpos(FILE *f, const fpos_t *pos)
{
	return __fseeko(f, pos->__aed_pos, SEEK_SET);
}
