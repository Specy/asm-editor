/* A double free is detected: the library prints a message on stderr and aborts with status 134 (glibc does
 * the same with different wording, so stderr is fixed in heap_errors.expect.stderr). */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#pragma GCC diagnostic ignored "-Wuse-after-free"

int main(void)
{
	/* volatile keeps the compiler from removing the allocation and the frees */
	char *volatile p = malloc(32);
	char *q = malloc(32);
	strcpy(p, "used");
	strcpy(q, "used");
	free(p);
	puts("freed once");
	fflush(stdout);
	free(p);
	puts("not reached");
	free(q);
	return 0;
}
