/* printf floating point: f e g a and the uppercase forms, flags, widths, precisions and rounding.
 * Both musl and glibc convert exactly and round correctly, so the bytes must match. */
/* core-instruction-limit: 50000000 (measured about 25M instructions at -O0 on RV32, RARS) */
#include <stdio.h>
#include <float.h>
#include <math.h>

static const double values[] = { 0.0, -0.0, 1.0, -1.0, 0.5, 0.1, 0.2, 0.3, 1.0 / 3, 2.0 / 3, 3.14159265358979,
	123.456, 1e-5, 1e-4, 999999.4, 1e6, 1e15, 1e16, 1e21, 1e22, 1e23, 1.5e300, 2.5e-300,
	123456789.0, 0.000123456789, 100.0, 9.995, 0.05, 0.15, 0.25, 0.35, 1e100 };

int main(void)
{
	unsigned i;
	for (i = 0; i < sizeof values / sizeof *values; i++) {
		double v = values[i];
		printf("%u: %f|%e|%g|%a\n", i, v, v, v, v);
		printf("   %.0f|%.1f|%.2f|%.10f|%.0e|%.3e|%.15e|%.0g|%.3g|%.10g|%.17g\n", v, v, v, v, v, v, v, v, v, v, v);
		printf("   %F|%E|%G|%A|%+f|% e|%#g|%#.0f|%#.0e|%#x\n", v, v, v, v, v, v, v, v, v, i);
		printf("   [%12.4f] [%-12.4f] [%012.4f] [%+012.4e] [% -12g] [%012g]\n", v, v, v, v, v, v);
	}
	/* 999999.5 rounds up to a new digit at 6 significant digits. C17 7.21.6.1 makes %#g "1.00000e+06", which the
	   library prints; glibc 2.43 prints "1.e+06", so %#g is left out for it. */
	printf("carry: %f %e %g %.6g %#.7g %G %a\n", 999999.5, 999999.5, 999999.5, 999999.5, 999999.5, 999999.5, 999999.5);
	printf("ties: %.0f %.0f %.0f %.0f %.0f %.0f %.1f %.1f %.1f %.2f %.2f\n", 0.5, 1.5, 2.5, 3.5, -0.5, -2.5,
		0.25, 0.35, 0.45, 1.005, 2.675);
	printf("g: %g %g %g %g %g %g %g %g\n", 100000.0, 1000000.0, 0.0001, 0.00001, 123456.0, 1234567.0, 1e-300, 1e300);
	printf("G: %G %G %.2G %#.2G %#G\n", 1e-10, 1e10, 0.000999, 1.0, 1.0);
	printf("inf: %f %e %g %a %F %E %G %A [%10f] [%-10f] [%010f] [%+f]\n", INFINITY, -INFINITY, HUGE_VAL,
		-HUGE_VAL, INFINITY, INFINITY, -INFINITY, INFINITY, INFINITY, -INFINITY, INFINITY, INFINITY);
	printf("nan: %f %e %g %F %E %G [%8f] [%-8f]\n", NAN, NAN, NAN, NAN, NAN, NAN, NAN, NAN);
	printf("limits: %e %e %e %e\n", DBL_MAX, DBL_MIN, DBL_EPSILON, DBL_TRUE_MIN);
	printf("limits: %.17g %.17g %.17g %.17g\n", DBL_MAX, DBL_MIN, DBL_EPSILON, DBL_TRUE_MIN);
	printf("limits: %a %a %a\n", DBL_MAX, DBL_MIN, DBL_EPSILON);
	printf("float: %f %e %g %a\n", FLT_MAX, (double)FLT_MIN, (double)FLT_EPSILON, (double)1.1f);
	printf("hex: %a %a %a %a %a %a %A\n", 1.0, 2.0, 0.5, 0.1, -1.75, 1e10, 255.5);
	printf("hexp: %.0a %.0a %.0a %.1a %.1a %.2a %.3a %.13a %.20a\n", 1.0, 1.5, 2.5, 1.03125, 1.96875, 0.1, 1.0 / 3,
		0.1, 0.1);
	printf("hexf: [%15a] [%-15a] [%+a] [% a] [%#.0a] [%015a]\n", 1.5, 1.5, 1.5, 1.5, 1.0, -1.5);
	printf("star: [%*.*f] [%-*.*e] [%.*g] [%.*f]\n", 10, 3, 3.14159, 12, 2, 31415.9, 3, 0.000123456, -1, 2.5);
	return 0;
}
