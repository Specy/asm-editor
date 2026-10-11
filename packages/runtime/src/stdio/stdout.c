/* Derived from musl 1.2.6 src/stdio/stdout.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: statically initialized and unbuffered (buf_size 0, no line buffering), so every call writes through;
 * writes with __stdio_write (no terminal check); no lock and no __stdout_used. */
#include "stdio_impl.h"

#undef stdout

static unsigned char buf[UNGET];
hidden FILE __stdout_FILE = {
	.buf = buf+UNGET,
	.buf_size = 0,
	.fd = 1,
	.flags = F_PERM | F_NORD,
	.lbf = EOF,
	.write = __stdio_write,
	.seek = __stdio_seek,
	.close = __stdio_close,
};
FILE *const stdout = &__stdout_FILE;
