/* <limits.h> and <float.h> values that are the same on every Target; long and pointer-sized limits are only
 * checked for consistency because they depend on the data model. */
#include <stdio.h>
#include <limits.h>
#include <float.h>

int main(void)
{
	printf("CHAR_BIT=%d SCHAR_MIN=%d SCHAR_MAX=%d UCHAR_MAX=%d\n", CHAR_BIT, SCHAR_MIN, SCHAR_MAX, UCHAR_MAX);
	printf("CHAR range is signed or unsigned char: %d\n", (CHAR_MIN == SCHAR_MIN && CHAR_MAX == SCHAR_MAX) ||
		(CHAR_MIN == 0 && CHAR_MAX == UCHAR_MAX));
	printf("SHRT_MIN=%d SHRT_MAX=%d USHRT_MAX=%d\n", SHRT_MIN, SHRT_MAX, USHRT_MAX);
	printf("INT_MIN=%d INT_MAX=%d UINT_MAX=%u\n", INT_MIN, INT_MAX, UINT_MAX);
	printf("LLONG_MIN=%lld LLONG_MAX=%lld ULLONG_MAX=%llu\n", LLONG_MIN, LLONG_MAX, ULLONG_MAX);
	printf("LONG consistent: %d %d\n", LONG_MAX == (sizeof(long) == 8 ? LLONG_MAX : INT_MAX), ULONG_MAX == (unsigned long)-1);
	printf("LONG_MIN consistent: %d\n", LONG_MIN == -LONG_MAX - 1);
	printf("MB_LEN_MAX >= 1: %d\n", MB_LEN_MAX >= 1);
	printf("FLT_RADIX=%d FLT_MANT_DIG=%d DBL_MANT_DIG=%d FLT_DIG=%d DBL_DIG=%d\n", FLT_RADIX, FLT_MANT_DIG, DBL_MANT_DIG,
		FLT_DIG, DBL_DIG);
	printf("FLT_MIN_EXP=%d FLT_MAX_EXP=%d DBL_MIN_EXP=%d DBL_MAX_EXP=%d\n", FLT_MIN_EXP, FLT_MAX_EXP, DBL_MIN_EXP,
		DBL_MAX_EXP);
	printf("FLT_MIN_10_EXP=%d FLT_MAX_10_EXP=%d DBL_MIN_10_EXP=%d DBL_MAX_10_EXP=%d\n", FLT_MIN_10_EXP, FLT_MAX_10_EXP,
		DBL_MIN_10_EXP, DBL_MAX_10_EXP);
	printf("FLT_MAX=%a FLT_MIN=%a FLT_EPSILON=%a FLT_TRUE_MIN=%a\n", (double)FLT_MAX, (double)FLT_MIN,
		(double)FLT_EPSILON, (double)FLT_TRUE_MIN);
	printf("DBL_MAX=%a DBL_MIN=%a DBL_EPSILON=%a DBL_TRUE_MIN=%.17g\n", DBL_MAX, DBL_MIN, DBL_EPSILON, DBL_TRUE_MIN);
	printf("FLT_DECIMAL_DIG=%d DBL_DECIMAL_DIG=%d FLT_EVAL_METHOD=%d FLT_ROUNDS=%d\n", FLT_DECIMAL_DIG, DBL_DECIMAL_DIG,
		FLT_EVAL_METHOD, FLT_ROUNDS);
	printf("subnormals: %d %d\n", FLT_HAS_SUBNORM, DBL_HAS_SUBNORM);
	return 0;
}
