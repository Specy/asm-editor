/* Transcendental functions at many points, printed with 10 significant digits: two good libms may differ in
 * the last bit of a result, never in its first 10 digits. Special values print exactly. NaN results print only
 * as "nan" via isnan, because the sign of a computed NaN depends on the processor. */
/* glibc declares the GNU extension sincos only with _GNU_SOURCE; the Runtime headers always declare it. */
#define _GNU_SOURCE
#include <stdio.h>
#include <math.h>

static void p(const char *name, double x, double r)
{
	if (isnan(r)) printf("%s(%.10g) = nan\n", name, x);
	else printf("%s(%.10g) = %.10g\n", name, x, r);
}

static void p2(const char *name, double x, double y, double r)
{
	if (isnan(r)) printf("%s(%.10g, %.10g) = nan\n", name, x, y);
	else printf("%s(%.10g, %.10g) = %.10g\n", name, x, y, r);
}

int main(void)
{
	double xs[] = { 0.0, -0.0, 0.1, 0.5, 1.0, -1.0, 2.0, M_PI / 6, M_PI / 4, M_PI / 2, M_PI, 3.0, 10.0, -7.25, 100.0,
		1e-8, 1e6, 1e22, 710.0, -745.5, 1e-310, INFINITY, -INFINITY, NAN };
	for (unsigned i = 0; i < sizeof xs / sizeof *xs; i++) {
		double x = xs[i];
		p("sin", x, sin(x)); p("cos", x, cos(x)); p("tan", x, tan(x));
		p("asin", x, asin(x)); p("acos", x, acos(x)); p("atan", x, atan(x));
		p("sinh", x, sinh(x)); p("cosh", x, cosh(x)); p("tanh", x, tanh(x));
		p("exp", x, exp(x)); p("expm1", x, expm1(x)); p("log", x, log(x)); p("log10", x, log10(x));
		p("log2", x, log2(x)); p("cbrt", x, cbrt(x));
	}
	double pw[][2] = { { 2, 10 }, { 2, 0.5 }, { 10, -2 }, { -2, 3 }, { -2, 0.5 }, { 0, 0 }, { 0, -1 }, { -0.0, -1 },
		{ 1, NAN }, { NAN, 0 }, { -1, INFINITY }, { 0.5, INFINITY }, { 2, -1075 }, { 2, 1024 }, { 1.0000001, 1e8 },
		{ 9, 0.5 }, { 27, 1.0 / 3 }, { -8, 1.0 / 3 }, { M_E, 2.5 }, { 1e10, 30 } };
	for (unsigned i = 0; i < sizeof pw / sizeof *pw; i++) p2("pow", pw[i][0], pw[i][1], pow(pw[i][0], pw[i][1]));
	double at[][2] = { { 1, 1 }, { 1, -1 }, { -1, -1 }, { -1, 1 }, { 0, -1 }, { -0.0, -1 }, { 0, 0 }, { 1, 0 },
		{ INFINITY, INFINITY }, { -INFINITY, 1 }, { 1e-300, 1e300 } };
	for (unsigned i = 0; i < sizeof at / sizeof *at; i++) p2("atan2", at[i][0], at[i][1], atan2(at[i][0], at[i][1]));
	double hy[][2] = { { 3, 4 }, { 5, 12 }, { 1e300, 1e300 }, { 1e-300, 1e-300 }, { INFINITY, NAN }, { -3, 0 } };
	for (unsigned i = 0; i < sizeof hy / sizeof *hy; i++) p2("hypot", hy[i][0], hy[i][1], hypot(hy[i][0], hy[i][1]));
	double s, c;
	sincos(0.75, &s, &c);
	printf("sincos(0.75) = %.10g %.10g\n", s, c);
	return 0;
}
