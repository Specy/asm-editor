/* Functions with exactly defined results, printed exactly: fabs, floor, ceil, round, trunc, fmod, sqrt
 * (correctly rounded), frexp, ldexp, modf, scalbn, copysign, fmin, fmax and the float versions. */
#include <stdio.h>
#include <math.h>
#include <float.h>

int main(void)
{
	double v[] = { 0.0, -0.0, 0.5, -0.5, 1.5, -1.5, 2.5, -2.5, 2.7, -2.7, 1e15 + 0.5, 4503599627370497.0, 1e300,
		-1e-300, DBL_MIN, DBL_TRUE_MIN };
	for (unsigned i = 0; i < sizeof v / sizeof *v; i++) {
		double x = v[i];
		printf("%-24.17g fabs=%g floor=%.17g ceil=%.17g round=%.17g trunc=%.17g\n", x, fabs(x), floor(x), ceil(x),
			round(x), trunc(x));
	}
	double sq[] = { 0.0, -0.0, 1.0, 2.0, 4.0, 0.25, 1e-300, 2e300, 3.0, 10.0, 0.1, DBL_MAX, DBL_TRUE_MIN, 123456789.0 };
	for (unsigned i = 0; i < sizeof sq / sizeof *sq; i++) printf("sqrt(%g) = %a\n", sq[i], sqrt(sq[i]));
	printf("sqrt(-1) is nan: %d, sqrt(inf) = %g\n", isnan(sqrt(-1.0)) != 0, sqrt(INFINITY));
	double fm[][2] = { { 5.5, 2 }, { -5.5, 2 }, { 5.5, -2 }, { 1e300, 3 }, { 7, 7 }, { 0.3, 0.1 }, { 1, INFINITY } };
	for (unsigned i = 0; i < sizeof fm / sizeof *fm; i++)
		printf("fmod(%g, %g) = %a\n", fm[i][0], fm[i][1], fmod(fm[i][0], fm[i][1]));
	printf("fmod(1, 0) is nan: %d\n", isnan(fmod(1, 0)) != 0);
	int e;
	double fr[] = { 8.0, 0.1, -3.0, 1.0, 0.0, DBL_MAX, DBL_TRUE_MIN };
	for (unsigned i = 0; i < sizeof fr / sizeof *fr; i++) {
		double m = frexp(fr[i], &e);
		printf("frexp(%g) = %a * 2^%d\n", fr[i], m, e);
	}
	printf("ldexp: %g %g %a %g\n", ldexp(0.75, 3), ldexp(1, -1074), ldexp(1, 1023), ldexp(1, 1024));
	printf("scalbn: %g %g %g\n", scalbn(3, 4), scalbn(1, -1), scalbn(-1, 2000));
	double ip;
	double fpart = modf(-3.75, &ip);
	printf("modf(-3.75) = %g + %g\n", ip, fpart);
	fpart = modf(2.5e20, &ip);
	printf("modf(2.5e20) = %g + %g\n", ip, fpart);
	fpart = modf(INFINITY, &ip);
	printf("modf(inf) = %g + %g\n", ip, fpart);
	printf("copysign: %g %g %g %g\n", copysign(3, -0.0), copysign(-3, 1), copysign(0, -1), copysign(INFINITY, -2));
	printf("fmin/fmax: %g %g %g %g %g %g\n", fmin(1, 2), fmax(1, 2), fmin(NAN, 1), fmax(1, NAN), fmin(-INFINITY, 0),
		fmax(-1, -2));
	printf("fmin(nan, nan) is nan: %d\n", isnan(fmin(NAN, NAN)) != 0);
	float f[] = { 0.5f, -1.5f, 2.5f, -2.7f, 1e10f, 3.0f, 0.1f, 16777217.0f };
	for (unsigned i = 0; i < sizeof f / sizeof *f; i++) {
		float x = f[i];
		printf("%g: fabsf=%a floorf=%a ceilf=%a roundf=%a truncf=%a sqrtf=%a fmodf=%a\n", x, fabsf(x), floorf(x),
			ceilf(x), roundf(x), truncf(x), sqrtf(fabsf(x)), fmodf(x, 0.75f));
	}
	return 0;
}
