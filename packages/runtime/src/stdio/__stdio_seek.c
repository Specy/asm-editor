/* Derived from musl 1.2.6 src/stdio/__stdio_seek.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: seeks with __aed_lseek; a failure sets errno to ESPIPE for the Terminal descriptors 0-2, else EINVAL. */
#include "stdio_impl.h"
#include <errno.h>

off_t __stdio_seek(FILE *f, off_t off, int whence)
{
	off_t r = __aed_lseek(f->fd, off, whence);
	if (r < 0) errno = f->fd <= 2 ? ESPIPE : EINVAL;
	return r;
}
