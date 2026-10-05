/* Derived from musl 1.2.6 src/stdio/stderr.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: no lock and no __stderr_used. */
#include "stdio_impl.h"

#undef stderr

static unsigned char buf[UNGET];
hidden FILE __stderr_FILE = {
	.buf = buf+UNGET,
	.buf_size = 0,
	.fd = 2,
	.flags = F_PERM | F_NORD,
	.lbf = -1,
	.write = __stdio_write,
	.seek = __stdio_seek,
	.close = __stdio_close,
};
FILE *const stderr = &__stderr_FILE;
