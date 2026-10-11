/* Derived from musl 1.2.6 src/stdio/clearerr.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: the clearerr_unlocked alias is removed. */
#include "stdio_impl.h"

void clearerr(FILE *f)
{
	FLOCK(f);
	f->flags &= ~(F_EOF|F_ERR);
	FUNLOCK(f);
}
