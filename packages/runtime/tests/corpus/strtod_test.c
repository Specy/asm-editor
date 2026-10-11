/* strtod, strtof and atof: correct rounding (printed as bit patterns), end pointers, hexadecimal input,
 * infinity and NaN spellings, overflow and underflow with ERANGE, and leading white space. Whether underflow to a
 * subnormal sets ERANGE is implementation-defined (C17 7.22.1.3), so ERANGE is shown only for results that are
 * infinite or zero. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <errno.h>
#include <math.h>

static void d(const char *s)
{
	char *end;
	errno = 0;
	double v = strtod(s, &end);
	int e = errno;
	uint64_t b;
	memcpy(&b, &v, 8);
	if (isnan(v)) printf("strtod %-28s -> nan end=+%d\n", s, (int)(end - s));
	else printf("strtod %-28s -> %016llx %-24.17g end=+%d%s\n", s, (unsigned long long)b, v, (int)(end - s),
		e == ERANGE && (isinf(v) || v == 0) ? " ERANGE" : "");
}

static void f(const char *s)
{
	char *end;
	errno = 0;
	float v = strtof(s, &end);
	int e = errno;
	uint32_t b;
	memcpy(&b, &v, 4);
	if (isnan(v)) printf("strtof %-28s -> nan end=+%d\n", s, (int)(end - s));
	else printf("strtof %-28s -> %08x %-16.9g end=+%d%s\n", s, (unsigned)b, v, (int)(end - s),
		e == ERANGE && (isinf(v) || v == 0) ? " ERANGE" : "");
}

int main(void)
{
	const char *ds[] = { "0", "-0", "1", "  \t\n+1.5", "-.25e2", "1e", "1e+", "1e-x", ".", "e5", "", "abc", "0x",
		"0x1p", "0x1.8p1", "0X10", "0x.1", "-0x1p-1074", "0x1.fffffffffffff8p1023", "1.5e-2junk", "12345678901234567890",
		"0.1", "0.2", "0.3", "1e22", "1e23", "9007199254740993", "4503599627370496.5", "2.2250738585072011e-308",
		"2.2250738585072014e-308", "4.9406564584124654e-324", "2.4703282292062328e-324", "1e-400", "-1e-400",
		"1.7976931348623158e308", "1.7976931348623159e308", "-1e400", "inf", "-INFINITY", "infinit", "+Inf",
		"nan", "NAN(abc)", "nan(", "-nan", "123.456e-2", "000000000000000000000000000000001.5",
		"0.000000000000000000000000000000000000000000000000001", "17976931348623157e292", "3.14159265358979323846" };
	for (unsigned i = 0; i < sizeof ds / sizeof *ds; i++) d(ds[i]);
	const char *fs[] = { "0.1", "1.17549435e-38", "1.17549421e-38", "3.40282347e38", "3.4028235e38", "3.4028236e38",
		"1e39", "1.4e-45", "7e-46", "8e-46", "1e-46", "16777217", "16777219", "33554435", "1.000000059604644775390625",
		"1.000000059604644775390626", "0x1.000001p0", "0x1.0000018p0", "-0.0", "inf", "2.5e-3x" };
	for (unsigned i = 0; i < sizeof fs / sizeof *fs; i++) f(fs[i]);
	printf("atof: %.17g %.17g %.17g %g\n", atof("3.25"), atof("  -1e-3xyz"), atof("1e10"), atof("junk"));
	char *end;
	printf("strtod(NULL end): %g\n", strtod("42.5", NULL));
	strtod("   ", &end);
	printf("blank end=%d\n", *end == ' ');
	return 0;
}
