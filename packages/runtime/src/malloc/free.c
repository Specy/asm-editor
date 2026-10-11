/* Runtime library: free (written for this library; see malloc_impl.h). */
#include <stdlib.h>
#include "malloc_impl.h"

void free(void *p)
{
	struct chunk *c;

	if (!p) return;
	c = CHUNK(p);
	if (((uintptr_t)p & (ALIGN - 1)) || !IS_USED(c))
		__aed_heap_error("free(): invalid pointer or double free");
	__aed_free_chunk(c);
}
