/* Derived from musl 1.2.6 src/stdio/__stdio_write.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: no writev; the pending buffer bytes (only vfprintf's internal buffer ever has any) and then buf are
 * written with __aed_write, retrying short writes; a failed or empty write sets errno to EIO and the error flag. */
#include "stdio_impl.h"
#include <errno.h>

size_t __stdio_write(FILE *f, const unsigned char *buf, size_t len)
{
	const unsigned char *base[2] = { f->wbase, buf };
	size_t rem[2] = { f->wpos - f->wbase, len };
	int i;

	for (i = 0; i < 2; i++) {
		while (rem[i]) {
			ssize_t cnt = __aed_write(f->fd, base[i], rem[i]);
			if (cnt <= 0) {
				errno = EIO;
				f->wpos = f->wbase = f->wend = 0;
				f->flags |= F_ERR;
				return i == 0 ? 0 : len - rem[1];
			}
			base[i] += cnt;
			rem[i] -= cnt;
		}
	}
	f->wend = f->buf + f->buf_size;
	f->wpos = f->wbase = f->buf;
	return len;
}
