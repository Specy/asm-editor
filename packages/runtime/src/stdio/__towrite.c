/* Derived from musl 1.2.6 src/stdio/__towrite.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: writing a read-only stream sets errno to EBADF; the stdio-exit hook is removed (nothing is ever buffered). */
#include "stdio_impl.h"
#include <errno.h>

int __towrite(FILE *f)
{
	f->mode |= f->mode-1;
	if (f->flags & F_NOWR) {
		errno = EBADF;
		f->flags |= F_ERR;
		return EOF;
	}
	/* Clear read buffer (easier than summoning nasal demons) */
	f->rpos = f->rend = 0;

	/* Activate write through the buffer. */
	f->wpos = f->wbase = f->buf;
	f->wend = f->buf + f->buf_size;

	return 0;
}
