/* Runtime library: malloc, a first-fit allocator over sbrk (written for this library; see malloc_impl.h).
 * The heap is set up on the first call, so no startup code is needed. */
#include <stdlib.h>
#include <errno.h>
#include "malloc_impl.h"
#include "aed_sys.h"

struct chunk *__aed_free_list;

/* Puts chunk c, whose size is set, on the free list and merges it with free neighbours. */
void __aed_free_chunk(struct chunk *c)
{
	struct chunk **pc = &__aed_free_list, *prev = 0, *n;

	while ((n = *pc) && (uintptr_t)n < (uintptr_t)c) {
		prev = n;
		pc = &n->next;
	}
	if (n && (char *)c + c->size == (char *)n) {
		c->size += n->size;
		n = n->next;
	}
	c->tag = c->size ^ TAG_FREE;
	c->next = n;
	if (prev && (char *)prev + prev->size == (char *)c) {
		prev->size += c->size;
		prev->tag = prev->size ^ TAG_FREE;
		prev->next = c->next;
	} else {
		*pc = c;
	}
}

/* Reports heap corruption on stderr and aborts. */
_Noreturn void __aed_heap_error(const char *msg)
{
	const char *e = msg;
	while (*e) e++;
	__aed_write(2, msg, e - msg);
	__aed_write(2, "\n", 1);
	__aed_exit(134);
}

/* Adds at least need bytes of free memory. last is the highest free chunk, or NULL. */
static int grow(size_t need, struct chunk *last)
{
	char *brk = __aed_sbrk(0), *p, *start, *end;
	size_t inc;

	if (brk == (void *)-1) return 0;
	if (last && (char *)last + last->size == brk)
		inc = need - last->size;  /* extend the free chunk at the top of the heap */
	else
		inc = (-(uintptr_t)brk & (ALIGN - 1)) + need;
	p = __aed_sbrk(inc);
	if (p == (void *)-1) return 0;
	if (last && (char *)last + last->size == p) {
		last->size += inc;
		last->tag = last->size ^ TAG_FREE;
		return 1;
	}
	start = (char *)(((uintptr_t)p + ALIGN - 1) & -ALIGN);
	end = (char *)((uintptr_t)(p + inc) & -ALIGN);
	if (end - start < (ptrdiff_t)MIN_CHUNK) return 0;
	((struct chunk *)start)->size = end - start;
	__aed_free_chunk((struct chunk *)start);
	return 1;
}

void *malloc(size_t n)
{
	struct chunk *c, **pc, *last;
	size_t need;

	if (n > MAX_REQUEST) goto oom;
	need = __aed_chunk_size(n);
	for (;;) {
		last = 0;
		for (pc = &__aed_free_list; (c = *pc); pc = &c->next) {
			if (c->size >= need) {
				if (c->size - need >= MIN_CHUNK) {
					struct chunk *rest = (struct chunk *)((char *)c + need);
					rest->size = c->size - need;
					rest->tag = rest->size ^ TAG_FREE;
					rest->next = c->next;
					*pc = rest;
					c->size = need;
				} else {
					*pc = c->next;
				}
				c->tag = c->size ^ TAG_USED;
				return MEM(c);
			}
			last = c;
		}
		if (!grow(need, last)) break;
	}
oom:
	errno = ENOMEM;
	return 0;
}
