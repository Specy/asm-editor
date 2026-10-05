/* Derived from musl 1.2.6 src/stdio/fopen.c and src/stdio/__fdopen.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: opens with __aed_open; a failed open sets errno to ENOENT; "x" fails with EEXIST if the file can
 * already be opened for reading; the FILE is allocated with only its UNGET bytes and stays unbuffered
 * (buf_size 0, no line buffering); no close-on-exec, terminal check, lock or open-file list. */
#include "stdio_impl.h"
#include <stdlib.h>
#include <string.h>
#include <errno.h>

FILE *fopen(const char *restrict filename, const char *restrict mode)
{
	FILE *f;
	int fd;
	int flags;

	/* Check for valid initial mode character */
	if (!strchr("rwa", *mode)) {
		errno = EINVAL;
		return 0;
	}

	/* Compute the mode to pass to open() */
	flags = __fmodeflags(mode);

	/* Exclusive creation: fail if the file already exists */
	if (*mode != 'r' && strchr(mode, 'x')) {
		fd = __aed_open(filename, AED_OPEN_READ);
		if (fd >= 0) {
			__aed_close(fd);
			errno = EEXIST;
			return 0;
		}
	}

	fd = __aed_open(filename, flags);
	if (fd < 0) {
		errno = ENOENT;
		return 0;
	}

	/* Allocate the FILE and its pushback bytes, or fail */
	if (!(f=malloc(sizeof *f + UNGET))) {
		__aed_close(fd);
		return 0;
	}
	memset(f, 0, sizeof *f);

	/* Impose mode restrictions */
	if (!strchr(mode, '+')) f->flags = (*mode == 'r') ? F_NOWR : F_NORD;
	if (*mode == 'a') f->flags |= F_APP;

	f->fd = fd;
	f->buf = (unsigned char *)f + sizeof *f + UNGET;
	f->buf_size = 0;
	f->lbf = EOF;

	/* Initialize op ptrs. No problem if some are unneeded. */
	f->read = __stdio_read;
	f->write = __stdio_write;
	f->seek = __stdio_seek;
	f->close = __stdio_close;

	return f;
}
