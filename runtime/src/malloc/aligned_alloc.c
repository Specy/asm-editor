/* Runtime library: aligned_alloc (written for this library; see malloc_impl.h). It over-allocates, then splits
 * the leading part off as a free chunk so the aligned block is an ordinary chunk that free accepts. */
#include <stdlib.h>
#include <errno.h>
#include "malloc_impl.h"

void *aligned_alloc(size_t align, size_t n)
{
	struct chunk *c, *t;
	char *p, *q;
	size_t lead;

	if (!align || (align & (align - 1))) {
		errno = EINVAL;
		return 0;
	}
	if (align <= ALIGN) return malloc(n);
	if (n > MAX_REQUEST - align - MIN_CHUNK) {
		errno = ENOMEM;
		return 0;
	}
	p = malloc(n + align + MIN_CHUNK);
	if (!p) return 0;
	q = (char *)(((uintptr_t)p + MIN_CHUNK + align - 1) & -(uintptr_t)align);
	c = CHUNK(p);
	t = CHUNK(q);
	lead = (char *)t - (char *)c;
	t->size = c->size - lead;
	t->tag = t->size ^ TAG_USED;
	c->size = lead;
	__aed_free_chunk(c);
	return q;
}
