/* printf of exact binary values: long %f expansions and many digits, which both implementations print exactly. */
#include <stdio.h>
#include <float.h>
#include <string.h>
#include <stdint.h>

static double from_bits(uint64_t b)
{
	double d;
	memcpy(&d, &b, sizeof d);
	return d;
}

int main(void)
{
	printf("%.60f\n", 0.1);
	printf("%.70f\n", 1.0 / 3);
	printf("%.0f\n", 1e300);
	printf("%f\n", DBL_MAX);
	printf("%.1080f\n", DBL_TRUE_MIN);
	printf("%.30e\n", DBL_TRUE_MIN);
	printf("%.40e\n", DBL_MIN);
	printf("%.25f %.25f\n", 0.3, 2.675);
	printf("%.17g %.17g %.17g\n", 9007199254740993.0, 9007199254740992.0, 4503599627370497.5);
	printf("%.20g %.20g %.20g\n", 1e23, 8.5e-15, 123.456);
	printf("%.0f %.0f %.0f\n", 9007199254740993.0, 1e22, 1e23);
	printf("%.3f %.3f %.3f %.3f\n", 1.0005, 1.0015, 1.0025, 1.0035);
	printf("%.15g %.16g %.17g %.18g\n", 0.1, 0.1, 0.1, 0.1);
	/* Values straddling rounding boundaries of %.17g and %.16e */
	for (int i = 0; i < 16; i++) {
		double d = from_bits(0x3ff0000000000000ull + (uint64_t)i * 0x0000123456789abcull);
		printf("%.17g %.16e %a\n", d, d, d);
	}
	for (int i = 0; i < 12; i++) {
		double d = from_bits(0x0010000000000000ull + (uint64_t)i * 0x00a5a5a5a5a5a5a5ull);
		printf("%.17g %.6e\n", d, d);
	}
	return 0;
}
