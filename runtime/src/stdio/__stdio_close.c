/* Derived from musl 1.2.6 src/stdio/__stdio_close.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: closes with __aed_close; no asynchronous I/O hook. */
#include "stdio_impl.h"

int __stdio_close(FILE *f)
{
	return __aed_close(f->fd);
}
