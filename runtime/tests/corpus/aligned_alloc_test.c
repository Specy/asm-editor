/* aligned_alloc for several power-of-two alignments; the blocks are usable and free releases them. */
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>

int main(void)
{
	size_t aligns[] = { 8, 16, 32, 64, 128, 256, 4096 };
	void *keep[7];
	for (int i = 0; i < 7; i++) {
		size_t a = aligns[i];
		char *p = aligned_alloc(a, a * 3);
		printf("aligned_alloc(%zu): non-null=%d aligned=%d\n", a, p != NULL, p && (uintptr_t)p % a == 0);
		memset(p, 'a' + i, a * 3);
		keep[i] = p;
	}
	int ok = 1;
	for (int i = 0; i < 7; i++) {
		const char *p = keep[i];
		for (size_t k = 0; k < aligns[i] * 3; k++) ok &= p[k] == 'a' + i;
	}
	printf("contents intact=%d\n", ok);
	for (int i = 0; i < 7; i++) free(keep[i]);
	char *after = malloc(100);
	printf("malloc after frees non-null=%d\n", after != NULL);
	free(after);
	return 0;
}
