/* abs, labs, llabs, div, ldiv and lldiv, including negative operands (C division truncates toward zero). */
#include <stdio.h>
#include <stdlib.h>
#include <limits.h>

int main(void)
{
	printf("abs: %d %d %d %d\n", abs(5), abs(-5), abs(0), abs(-INT_MAX));
	printf("labs: %ld %ld\n", labs(-123456L), labs(2000000000L));
	printf("llabs: %lld %lld\n", llabs(-9000000000000000000LL), llabs(LLONG_MAX));
	int n[] = { 17, -17, 17, -17, 0, 6 }, d[] = { 5, 5, -5, -5, 3, 3 };
	for (int i = 0; i < 6; i++) {
		div_t q = div(n[i], d[i]);
		ldiv_t lq = ldiv(n[i], d[i]);
		lldiv_t llq = lldiv(n[i] * 1000000000000LL, d[i]);
		printf("div(%d,%d)=%d r %d; ldiv=%ld r %ld; lldiv(%lld)=%lld r %lld\n", n[i], d[i], q.quot, q.rem, lq.quot,
			lq.rem, n[i] * 1000000000000LL, llq.quot, llq.rem);
	}
	return 0;
}
