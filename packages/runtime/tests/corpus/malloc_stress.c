/* A pseudo-random sequence of malloc, realloc and free over 32 slots, checking every block's contents, so
 * splitting, merging, growing in place and moving are all exercised. Sized to stay near ten million
 * instructions on a Core. */
/* core-instruction-limit: 50000000 (measured about 16M instructions at -O0 on RV32, RARS) */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static unsigned state = 12345;
static unsigned next(void)
{
	state = state * 1103515245u + 12345u;
	return (state >> 16) & 0x7fff;
}

int main(void)
{
	enum { SLOTS = 32, STEPS = 3000 };
	unsigned char *slot[SLOTS] = { 0 };
	size_t size[SLOTS] = { 0 };
	unsigned char tag[SLOTS] = { 0 };
	long errors = 0, allocs = 0, reallocs = 0, frees = 0;
	for (int step = 0; step < STEPS; step++) {
		int i = next() % SLOTS;
		for (size_t k = 0; k < size[i]; k++) errors += slot[i][k] != (unsigned char)(tag[i] + k);
		unsigned op = next() % 3;
		size_t limit = next() % 4 == 0 ? 600 : 64;
		size_t n = 1 + next() % limit; /* realloc(p, 0) is implementation-defined */
		if (op == 0 || !slot[i]) {
			free(slot[i]);
			slot[i] = malloc(n);
			allocs++;
			size[i] = n;
		} else if (op == 1) {
			unsigned char *q = realloc(slot[i], n);
			if (!q) errors++;
			slot[i] = q;
			if (n < size[i]) size[i] = n;
			for (size_t k = 0; k < size[i]; k++) errors += slot[i][k] != (unsigned char)(tag[i] + k);
			size[i] = n;
			reallocs++;
		} else {
			free(slot[i]);
			slot[i] = 0;
			size[i] = 0;
			frees++;
		}
		tag[i] = (unsigned char)next();
		for (size_t k = 0; k < size[i]; k++) slot[i][k] = (unsigned char)(tag[i] + k);
	}
	for (int i = 0; i < SLOTS; i++) free(slot[i]);
	printf("allocs=%ld reallocs=%ld frees=%ld errors=%ld\n", allocs, reallocs, frees, errors);
	return 0;
}
