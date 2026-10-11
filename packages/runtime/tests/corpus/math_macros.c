/* Classification macros, comparison macros, HUGE_VAL, INFINITY, NAN and the M_ constants. */
#include <stdio.h>
#include <math.h>
#include <float.h>

static const char *cls(int c)
{
	switch (c) {
	case FP_NAN: return "FP_NAN";
	case FP_INFINITE: return "FP_INFINITE";
	case FP_ZERO: return "FP_ZERO";
	case FP_SUBNORMAL: return "FP_SUBNORMAL";
	case FP_NORMAL: return "FP_NORMAL";
	}
	return "?";
}

int main(void)
{
	double v[] = { 0.0, -0.0, 1.0, -2.5, DBL_MIN, DBL_TRUE_MIN, -DBL_TRUE_MIN, DBL_MAX, INFINITY, -INFINITY, NAN, HUGE_VAL };
	const char *names[] = { "0", "-0", "1", "-2.5", "DBL_MIN", "DBL_TRUE_MIN", "-DBL_TRUE_MIN", "DBL_MAX", "INFINITY",
		"-INFINITY", "NAN", "HUGE_VAL" };
	for (unsigned i = 0; i < sizeof v / sizeof *v; i++) {
		double x = v[i];
		printf("%-14s %-13s isnan=%d isinf=%d isfinite=%d isnormal=%d signbit=%d\n", names[i], cls(fpclassify(x)),
			isnan(x) != 0, isinf(x) != 0, isfinite(x) != 0, isnormal(x) != 0, signbit(x) != 0);
	}
	float f[] = { 0.0f, FLT_MIN, FLT_TRUE_MIN, 1.0f, INFINITY, NAN, HUGE_VALF };
	for (unsigned i = 0; i < sizeof f / sizeof *f; i++)
		printf("float %u: %s isnan=%d isinf=%d\n", i, cls(fpclassify(f[i])), isnan(f[i]) != 0, isinf(f[i]) != 0);
	printf("isgreater=%d isgreaterequal=%d isless=%d islessequal=%d islessgreater=%d isunordered=%d\n",
		isgreater(2.0, 1.0) != 0, isgreaterequal(1.0, 1.0) != 0, isless(1.0, 2.0) != 0, islessequal(2.0, 1.0) != 0,
		islessgreater(1.0, 1.0) != 0, isunordered(1.0, NAN) != 0);
	printf("with nan: isgreater=%d isless=%d islessgreater=%d\n", isgreater(NAN, 1.0) != 0, isless(NAN, 1.0) != 0,
		islessgreater(NAN, 1.0) != 0);
	printf("HUGE_VAL=%g HUGE_VALF=%g INFINITY=%g -INFINITY=%g NAN=%g\n", HUGE_VAL, (double)HUGE_VALF, (double)INFINITY,
		(double)-INFINITY, (double)NAN);
	printf("M_PI=%.17g M_E=%.17g M_LN2=%.17g M_LN10=%.17g\n", M_PI, M_E, M_LN2, M_LN10);
	printf("M_LOG2E=%.17g M_LOG10E=%.17g M_PI_2=%.17g M_PI_4=%.17g\n", M_LOG2E, M_LOG10E, M_PI_2, M_PI_4);
	printf("M_1_PI=%.17g M_2_PI=%.17g M_2_SQRTPI=%.17g M_SQRT2=%.17g M_SQRT1_2=%.17g\n", M_1_PI, M_2_PI, M_2_SQRTPI,
		M_SQRT2, M_SQRT1_2);
	float_t ft = 1.5f;
	double_t dt = 2.5;
	printf("float_t=%g double_t=%g sizes=%d %d\n", (double)ft, (double)dt, (int)sizeof(float_t), (int)sizeof(double_t));
	return 0;
}
