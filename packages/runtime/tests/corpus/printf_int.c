/* printf integer conversions: d i u o x X c s %, flags, widths, precisions, '*', length modifiers, return values. */
#include <stdio.h>
#include <limits.h>
#include <stdint.h>
#include <stddef.h>

int main(void)
{
	int r;
	r = printf("[%d] [%i] [%u] [%o] [%x] [%X]\n", 42, -42, 42u, 8u, 255u, 255u);
	printf("returned %d\n", r);
	printf("[%5d] [%-5d] [%05d] [%+d] [% d] [%+5d] [%-+5d] [% 05d]\n", 42, 42, 42, 42, 42, 42, 42, 42);
	printf("[%.3d] [%8.3d] [%-8.3d] [%.0d] [%+.0d] [%5.0d]\n", 7, 7, 7, 0, 0, 0);
	printf("[%#x] [%#X] [%#o] [%#o] [%#x] [%#.3o] [%#10x] [%#010x]\n", 255u, 255u, 8u, 0u, 0u, 8u, 255u, 255u);
	printf("[%*d] [%-*d] [%*d] [%.*d] [%*.*d] [%.*d]\n", 6, 1, 6, 2, -6, 3, 4, 5, 8, 3, 6, -1, 7);
	printf("[%d] [%d] [%u] [%x]\n", INT_MAX, INT_MIN, UINT_MAX, UINT_MAX);
	printf("[%hhd] [%hhu] [%hd] [%hu] [%hhx] [%hx]\n", 300, 300, 70000, 70000, 0x1ff, 0x1ffff);
	printf("[%ld] [%lu] [%lx] [%lo]\n", -2000000000L, 4000000000UL, 0xdeadbeefUL, 0777UL);
	printf("[%lld] [%lld] [%llu] [%llx] [%llX] [%llo]\n", LLONG_MAX, LLONG_MIN, ULLONG_MAX, 0x123456789abcdefULL,
		0xfedcba9876543210ULL, 01234567012345670123ULL);
	printf("[%jd] [%ju] [%zd] [%zu] [%td] [%zx]\n", (intmax_t)-9000000000LL, (uintmax_t)18000000000ULL,
		(ptrdiff_t)-5, sizeof(int), (ptrdiff_t)12, (size_t)0xabc);
	printf("[%" "d" "] [%c] [%5c] [%-5c] [%c%c%c]\n", 1, 'x', 'y', 'z', 'a', 'b', 'c');
	printf("[%s] [%10s] [%-10s] [%.3s] [%10.2s] [%-10.4s] [%.0s] [%s]\n", "hello", "hi", "hi", "abcdef", "xyz",
		"truncate", "gone", "");
	printf("[%%] [%%%%] [100%%]\n");
	printf("[%2$s %1$s] [%3$d %3$x] [%1$s]\n", "world", "hello", 255);
	printf("[%1$*2$d] [%1$-*2$d] [%3$.*4$f]\n", 7, 5, 3.14159, 2);
	r = printf("%s", "");
	printf("empty returned %d\n", r);
	r = printf("%c", '\0');
	printf("|NUL returned %d\n", r);
	r = fprintf(stdout, "%d-%s\n", 12345, "fprintf");
	printf("fprintf returned %d\n", r);
	r = fprintf(stderr, "to stderr %d\n", 7);
	printf("stderr returned %d\n", r);
	return 0;
}
