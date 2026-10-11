/* Derived from musl 1.2.6 src/stdio/ftell.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: off_t is long, so the overflow checks use LONG_MAX and ftell needs no narrowing check; the ftello alias is removed. */
#include "stdio_impl.h"
#include <limits.h>
#include <errno.h>

off_t __ftello_unlocked(FILE *f)
{
	off_t pos = f->seek(f, 0,
		(f->flags & F_APP) && f->wpos != f->wbase
		? SEEK_END : SEEK_CUR);
	if (pos < 0) return pos;

	/* Adjust for data in buffer. */
	if (f->rend)
		pos += f->rpos - f->rend;
	else if (f->wbase) {
		if (f->wpos - f->wbase > LONG_MAX - pos) {
			errno = EOVERFLOW;
			return -1;
		}
		pos += f->wpos - f->wbase;
	}
	return pos;
}

off_t __ftello(FILE *f)
{
	off_t pos;
	FLOCK(f);
	pos = __ftello_unlocked(f);
	FUNLOCK(f);
	return pos;
}

long ftell(FILE *f)
{
	return __ftello(f);
}
