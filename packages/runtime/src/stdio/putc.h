/* Derived from musl 1.2.6 src/stdio/putc.h (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: no threads, so do_putc is putc_unlocked without the locking path. */
#include "stdio_impl.h"

static inline int do_putc(int c, FILE *f)
{
	return putc_unlocked(c, f);
}
