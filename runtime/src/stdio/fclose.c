/* Derived from musl 1.2.6 src/stdio/fclose.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: no open-file list, pipes, locked-file list or getline buffer; nothing is buffered, so there is
 * nothing to flush before closing. */
#include "stdio_impl.h"
#include <stdlib.h>

int fclose(FILE *f)
{
	int r = fflush(f);
	r |= f->close(f);

	/* The standard streams are static and stay allocated. */
	if (f->flags & F_PERM) return r;

	FILE **link = &__aed_open_streams;
	while (*link && *link != f) link = &(*link)->next_open;
	if (*link) *link = f->next_open;
	free(f->owned_buffer);
	free(f);

	return r;
}
