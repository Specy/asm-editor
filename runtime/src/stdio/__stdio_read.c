/* Derived from musl 1.2.6 src/stdio/__stdio_read.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: every FILE is unbuffered (buf_size 0), so this reads straight into the caller's buffer with one
 * __aed_read instead of readv; a zero-length request reads nothing; a failed read sets errno to EIO. */
#include "stdio_impl.h"
#include <errno.h>

size_t __stdio_read(FILE *f, unsigned char *buf, size_t len)
{
	ssize_t cnt;

	if (!len) return 0;
	if (f->fd == 0 && stdout->lbf >= 0) fflush(stdout);
	cnt = __aed_read(f->fd, buf, len);
	if (cnt <= 0) {
		if (cnt) errno = EIO;
		f->flags |= cnt ? F_ERR : F_EOF;
		return 0;
	}
	return cnt;
}
