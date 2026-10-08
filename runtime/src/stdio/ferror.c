/* Derived from musl 1.2.6 src/stdio/ferror.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: aliases removed. */
#include "stdio_impl.h"

#undef ferror

int ferror(FILE *f)
{
	FLOCK(f);
	int ret = !!(f->flags & F_ERR);
	FUNLOCK(f);
	return ret;
}
