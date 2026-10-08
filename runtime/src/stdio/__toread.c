/* Derived from musl 1.2.6 src/stdio/__toread.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: reading a write-only stream sets errno to EBADF; the stdio-exit hook is removed (nothing is ever buffered). */
#include "stdio_impl.h"
#include <errno.h>

int __toread(FILE *f)
{
	f->mode |= f->mode-1;
	if (f->wpos != f->wbase) f->write(f, 0, 0);
	f->wpos = f->wbase = f->wend = 0;
	if (f->flags & F_NORD) {
		errno = EBADF;
		f->flags |= F_ERR;
		return EOF;
	}
	/* Output buffers may be supplied by the caller and have no UNGET prefix. */
	f->rpos = f->rend = f->input_buffer ? f->input_buffer : f->buf;
	return (f->flags & F_EOF) ? EOF : 0;
}
