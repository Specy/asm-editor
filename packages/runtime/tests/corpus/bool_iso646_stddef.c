/* <stdbool.h>, <iso646.h>, <stddef.h> (size_t, ptrdiff_t, NULL, offsetof, max_align_t) and <stdnoreturn.h>. */
#include <stdio.h>
#include <stdbool.h>
#include <iso646.h>
#include <stddef.h>
#include <stdlib.h>
#include <stdnoreturn.h>

struct packet { char kind; int value; double weight; char tail[3]; };

static noreturn void stop(int code)
{
	printf("stopping with %d\n", code);
	exit(code);
}

int main(void)
{
	bool t = true, f = false;
	printf("bool: %d %d %d sizeof<=int=%d\n", t, f, (bool)42, sizeof(bool) <= sizeof(int));
	printf("iso646: %d %d %d %d %d\n", t and f, t or f, not f, 6 bitand 3, 6 xor 3);
	int bits = 5;
	bits or_eq 2;
	bits and_eq 6;
	printf("iso646 assign: %d %d\n", bits, compl 0);
	int arr[10];
	ptrdiff_t diff = &arr[7] - &arr[2];
	size_t n = sizeof arr / sizeof arr[0];
	printf("ptrdiff=%td size=%zu NULL is null=%d\n", diff, n, (void *)NULL == 0);
	printf("offsetof: kind=%zu value aligned=%d after kind=%d\n", offsetof(struct packet, kind),
		offsetof(struct packet, value) % _Alignof(int) == 0, offsetof(struct packet, value) >= 1);
	printf("max_align_t at least double: %d\n", _Alignof(max_align_t) >= _Alignof(double));
	stop(3);
}
