/* Runtime library: freopen, written for this library (musl's version relies on dup3 and fcntl).
 * The stream keeps its FILE object and gets the newly opened descriptor; a replaced Terminal descriptor
 * (0-2) is left open. Changing only the mode (path NULL) is not supported and fails with EINVAL. */
#include "stdio_impl.h"
#include <string.h>
#include <errno.h>

FILE *freopen(const char *restrict filename, const char *restrict mode, FILE *restrict f)
{
	int fd;

	if (!filename || !strchr("rwa", *mode)) {
		errno = EINVAL;
		goto fail;
	}
	fd = __aed_open(filename, __fmodeflags(mode));
	if (fd < 0) {
		errno = ENOENT;
		goto fail;
	}
	if (f->fd > 2) f->close(f);

	f->fd = fd;
	f->flags &= F_PERM;
	if (!strchr(mode, '+')) f->flags |= (*mode == 'r') ? F_NOWR : F_NORD;
	if (*mode == 'a') f->flags |= F_APP;
	f->rpos = f->rend = 0;
	f->wpos = f->wbase = f->wend = 0;
	f->mode = 0;
	f->lbf = EOF;
	f->read = __stdio_read;
	f->write = __stdio_write;
	f->seek = __stdio_seek;
	f->close = __stdio_close;
	return f;

fail:
	fclose(f);
	return 0;
}
