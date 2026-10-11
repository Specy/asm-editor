/* Derived from musl 1.2.6 src/stdio/feof.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: aliases removed. */
#include "stdio_impl.h"

#undef feof

int feof(FILE *f)
{
	FLOCK(f);
	int ret = !!(f->flags & F_EOF);
	FUNLOCK(f);
	return ret;
}
