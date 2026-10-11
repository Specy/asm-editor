/* Runtime library: realloc (written for this library; see malloc_impl.h). A block grows in place into a free
 * neighbour when it can and shrinks in place; realloc(p, 0) shrinks p to the minimum size and returns it. */
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include "malloc_impl.h"

void *realloc(void *p, size_t n)
{
	struct chunk *c, **pc, *f;
	size_t need;
	void *q;

	if (!p) return malloc(n);
	c = CHUNK(p);
	if (((uintptr_t)p & (ALIGN - 1)) || !IS_USED(c))
		__aed_heap_error("realloc(): invalid pointer");
	if (n > MAX_REQUEST) {
		errno = ENOMEM;
		return 0;
	}
	need = __aed_chunk_size(n);
	if (need > c->size) {
		/* Absorb the free chunk that follows, if it is big enough. */
		for (pc = &__aed_free_list; (f = *pc) && (uintptr_t)f < (uintptr_t)c; pc = &f->next);
		if (f && (char *)c + c->size == (char *)f && c->size + f->size >= need) {
			*pc = f->next;
			c->size += f->size;
		} else {
			q = malloc(n);
			if (!q) return 0;
			memcpy(q, p, c->size - HDR);
			free(p);
			return q;
		}
	}
	if (c->size - need >= MIN_CHUNK) {
		struct chunk *t = (struct chunk *)((char *)c + need);
		t->size = c->size - need;
		c->size = need;
		__aed_free_chunk(t);
	}
	c->tag = c->size ^ TAG_USED;
	return p;
}
