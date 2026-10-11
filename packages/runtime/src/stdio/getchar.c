/* Derived from musl 1.2.6 src/stdio/getchar.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: uses the lock-free getc.h; aliases removed. */
#include <stdio.h>
#include "getc.h"

int getchar(void)
{
	return do_getc(stdin);
}
