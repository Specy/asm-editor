/* Derived from musl 1.2.6 src/stdio/getc.h (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: no threads, so do_getc is getc_unlocked without the locking path. */
#include "stdio_impl.h"

static inline int do_getc(FILE *f)
{
	return getc_unlocked(f);
}
