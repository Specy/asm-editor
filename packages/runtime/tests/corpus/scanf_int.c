/* scanf integer conversions from stdin: d i u o x X n, widths, assignment suppression, length modifiers,
 * literal matching, return values, matching failure and end of input. Each case reads one input line. */
#include <stdio.h>

static void skip_line(void)
{
	int c;
	while ((c = getchar()) != '\n' && c != EOF);
}

int main(void)
{
	int a = 0, b = 0, c = 0, n = 0, r;
	unsigned u = 0;
	r = scanf("%d %d", &a, &b);
	printf("1: r=%d a=%d b=%d\n", r, a, b);
	r = scanf("%i %i %i %i", &a, &b, &c, &n);
	printf("2: r=%d %d %d %d %d\n", r, a, b, c, n);
	r = scanf("%x %X %o %u", &a, &b, &c, &u);
	printf("3: r=%d %d %d %d %u\n", r, a, b, c, u);
	r = scanf("%3d%2d%d", &a, &b, &c);
	printf("4: r=%d %d %d %d\n", r, a, b, c);
	r = scanf("%d,%d ; %d", &a, &b, &c);
	printf("5: r=%d %d %d %d\n", r, a, b, c);
	r = scanf("%*d %d%n", &a, &n);
	printf("6: r=%d a=%d n=%d\n", r, a, n);
	signed char hh = 0;
	short h = 0;
	long l = 0;
	long long ll = 0;
	unsigned long long ull = 0;
	r = scanf("%hhd %hd %ld %lld %llu", &hh, &h, &l, &ll, &ull);
	printf("7: r=%d %d %d %ld %lld %llu\n", r, hh, h, l, ll, ull);
	skip_line();
	r = scanf("%d", &a);
	printf("8: r=%d (matching failure), next char '%c'\n", r, getchar());
	skip_line();
	a = b = 0;
	r = scanf("%d%d", &a, &b);
	printf("9: r=%d a=%d (partial), next char '%c'\n", r, a, getchar());
	skip_line();
	r = scanf("%u", &u);
	printf("10: r=%d u=%u\n", r, u);
	r = scanf(" total: %d%%", &a);
	printf("11: r=%d a=%d\n", r, a);
	r = scanf("%d", &a);
	printf("12: r=%d at end\n", r);
	r = scanf("%d", &a);
	printf("13: r=%d still at end\n", r);
	return 0;
}
