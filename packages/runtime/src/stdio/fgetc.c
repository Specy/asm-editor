/* Derived from musl 1.2.6 src/stdio/fgetc.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: uses the lock-free getc.h; aliases removed. */
#include <stdio.h>
#include "getc.h"

int fgetc(FILE *f)
{
	return do_getc(f);
}
