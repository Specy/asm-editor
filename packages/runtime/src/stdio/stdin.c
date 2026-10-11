/* Derived from musl 1.2.6 src/stdio/stdin.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: statically initialized and unbuffered (buf_size 0); the UNGET bytes before buf keep ungetc and
 * scanf's one-character pushback working; no lock and no __stdin_used. */
#include "stdio_impl.h"

#undef stdin

static unsigned char buf[UNGET];
hidden FILE __stdin_FILE = {
	.buf = buf+UNGET,
	.buf_size = 0,
	.fd = 0,
	.flags = F_PERM | F_NOWR,
	.lbf = EOF,
	.read = __stdio_read,
	.seek = __stdio_seek,
	.close = __stdio_close,
};
FILE *const stdin = &__stdin_FILE;
