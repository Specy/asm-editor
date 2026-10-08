/* scanf floating-point conversions (f e g a, float and double) on decimal, hexadecimal, infinite and
 * NaN input, printed exactly. Both libraries round correctly, so the bits must match. */
#include <stdio.h>
#include <string.h>
#include <stdint.h>
#include <math.h>

static unsigned long long dbits(double d)
{
	uint64_t b;
	memcpy(&b, &d, 8);
	return b;
}

static unsigned fbits(float f)
{
	uint32_t b;
	memcpy(&b, &f, 4);
	return b;
}

int main(void)
{
	double d;
	float f;
	int r, i = 0;
	while ((r = scanf("%lf", &d)) == 1) {
		if (isnan(d)) printf("%2d: nan\n", i++);
		else printf("%2d: %016llx %.17g\n", i++, dbits(d), d);
	}
	printf("double loop ended with r=%d\n", r);
	char word[16];
	r = scanf("%15s", word);
	printf("separator r=%d %s\n", r, word);
	while ((r = scanf("%f", &f)) == 1) {
		if (isnan(f)) printf("%2d: nan\n", i++);
		else printf("%2d: %08x %.9g\n", i++, fbits(f), f);
	}
	printf("float loop ended with r=%d\n", r);
	r = scanf("%15s", word);
	printf("separator r=%d %s\n", r, word);
	double e1, e2, e3;
	r = scanf("%le %lg %la", &e1, &e2, &e3);
	printf("e g a: r=%d %.17g %.17g %.17g\n", r, e1, e2, e3);
	r = scanf("%4lf%lf", &e1, &e2);
	printf("width: r=%d %.17g %.17g\n", r, e1, e2);
	r = scanf("%*f %lf", &e1);
	printf("suppressed: r=%d %.17g\n", r, e1);
	return 0;
}
