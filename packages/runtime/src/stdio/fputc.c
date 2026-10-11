/* Derived from musl 1.2.6 src/stdio/fputc.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: uses the lock-free putc.h; aliases removed. */
#include <stdio.h>
#include "putc.h"

int fputc(int c, FILE *f)
{
	return do_putc(c, f);
}
