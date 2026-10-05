/* Derived from musl 1.2.6 src/stdio/fclose.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: no open-file list, pipes, locked-file list or getline buffer; nothing is buffered, so there is
 * nothing to flush before closing. */
#include "stdio_impl.h"
#include <stdlib.h>

int fclose(FILE *f)
{
	int r = f->close(f);

	/* The standard streams are static and stay allocated. */
	if (f->flags & F_PERM) return r;

	free(f);

	return r;
}
