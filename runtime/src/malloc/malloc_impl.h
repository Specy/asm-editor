/* Runtime library: internal layout of the heap (written for this library).
 *
 * The heap grows with sbrk and never shrinks (the Cores reject a negative sbrk). Every chunk starts with a
 * two-word header padded to ALIGN; the caller's memory follows it, aligned to max_align_t:
 * 8 bytes on MIPS and 16 on RISC-V. Free chunks form one list in address order, and neighbouring free chunks are merged.
 * The tag word lets free and realloc reject pointers that malloc did not return, and double frees. */
#ifndef AED_MALLOC_IMPL_H
#define AED_MALLOC_IMPL_H

#include <stddef.h>
#include <stdint.h>

#define ALIGN _Alignof(max_align_t)
#define HDR ALIGN
#define MIN_CHUNK (2 * ALIGN)
/* Each sbrk request must stay below 2 GiB: the Cores read its size as a signed 32-bit value. */
#define MAX_REQUEST ((size_t)0x7fff0000)

#define TAG_USED ((size_t)0x5ca1ab1e)
#define TAG_FREE ((size_t)0xf4eec0de)

struct chunk {
	size_t size;        /* bytes in the chunk, header included; a multiple of ALIGN */
	size_t tag;         /* size ^ TAG_USED while allocated, size ^ TAG_FREE while free */
	struct chunk *next; /* free chunks only: the next free chunk, in address order */
};
_Static_assert(sizeof(struct chunk) <= MIN_CHUNK, "free chunk fits minimum allocation");

#define CHUNK(p) ((struct chunk *)((char *)(p) - HDR))
#define MEM(c) ((void *)((char *)(c) + HDR))
#define IS_USED(c) ((c)->tag == ((c)->size ^ TAG_USED))

/* Rounds a request of n bytes (n <= MAX_REQUEST) up to a chunk size. */
static inline size_t __aed_chunk_size(size_t n)
{
	size_t need = (n + HDR + ALIGN - 1) & -ALIGN;
	return need < MIN_CHUNK ? MIN_CHUNK : need;
}

extern struct chunk *__aed_free_list;
void __aed_free_chunk(struct chunk *c);
_Noreturn void __aed_heap_error(const char *msg);

#endif
