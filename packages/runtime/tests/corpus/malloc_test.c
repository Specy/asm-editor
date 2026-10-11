/* malloc, calloc, realloc and free: alignment, contents kept by realloc when growing and shrinking, calloc
 * zeroing and overflow, malloc(0), free(NULL), huge requests failing with ENOMEM, and memory reuse. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <errno.h>

/* LLVM assumes the allocation functions never set errno and folds a read of it right after one, as it
 * would on any platform, so the failing cases clear and read it through volatile accesses. */
static void clear_errno(void) { *(volatile int *)&errno = 0; }
static int out_of_memory(void) { return *(volatile int *)&errno == ENOMEM; }

int main(void)
{
	/* volatile: the deliberately impossible sizes must not be diagnosed at compile time */
	volatile size_t huge = (size_t)-1, half = (size_t)-1 / 2, four = 4;
	char *p = malloc(10);
	printf("malloc(10) non-null=%d aligned8=%d\n", p != NULL, (uintptr_t)p % 8 == 0);
	strcpy(p, "abcdefghi");
	p = realloc(p, 100);
	printf("grown keeps=%s\n", p);
	memset(p + 10, 'x', 89);
	p[99] = 0;
	p = realloc(p, 5);
	p[4] = 0;
	printf("shrunk keeps=%s\n", p);
	free(p);

	int *z = calloc(1000, sizeof *z);
	int sum = 0;
	for (int i = 0; i < 1000; i++) sum += z[i];
	printf("calloc zero sum=%d\n", sum);
	free(z);

	clear_errno();
	/* volatile: a compiler may drop an allocation whose result is only compared with NULL, and
	 * LLVM does, as if it had succeeded */
	void *volatile big = calloc(half, four);
	printf("calloc overflow null=%d errno==ENOMEM %d\n", big == NULL, out_of_memory());
	clear_errno();
	big = malloc(huge);
	printf("malloc huge null=%d errno==ENOMEM %d\n", big == NULL, out_of_memory());
	char *keep = malloc(16);
	strcpy(keep, "still here");
	clear_errno();
	char *r = realloc(keep, huge - 4096);
	if (r) {
		free(r);
	} else {
		printf("realloc huge null=1 errno==ENOMEM %d old=%s\n", out_of_memory(), keep);
		free(keep);
	}

	void *zero = malloc(0);
	printf("malloc(0) non-null=%d\n", zero != NULL);
	free(zero);
	free(NULL);
	char *n = realloc(NULL, 8);
	strcpy(n, "fresh");
	printf("realloc(NULL)=%s\n", n);
	free(n);

	/* Blocks of many sizes, written and checked, freed in an interleaved order. */
	enum { N = 200 };
	unsigned char *blocks[N];
	for (int i = 0; i < N; i++) {
		size_t size = 1 + (size_t)(i * 37 % 300);
		blocks[i] = malloc(size);
		memset(blocks[i], i & 0xff, size);
	}
	int bad = 0;
	for (int i = 0; i < N; i += 2) free(blocks[i]);
	for (int i = 1; i < N; i += 2) {
		size_t size = 1 + (size_t)(i * 37 % 300);
		for (size_t k = 0; k < size; k++) bad += blocks[i][k] != (i & 0xff);
	}
	for (int i = 0; i < N; i += 2) blocks[i] = malloc(64);
	for (int i = 0; i < N; i++) free(blocks[i]);
	printf("interleaved corrupted bytes=%d\n", bad);

	/* Freed memory is reused rather than growing the heap forever. */
	char *first = malloc(1000);
	free(first);
	int reused = 0;
	for (int i = 0; i < 1000; i++) {
		char *q = malloc(1000);
		reused += q != NULL;
		free(q);
	}
	printf("repeated alloc/free ok=%d\n", reused);
	return 0;
}
