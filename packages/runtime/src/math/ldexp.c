/* Derived from musl 1.2.6 src/math/ldexp.c (MIT, see runtime/third_party/musl/COPYRIGHT). Unchanged apart from this comment. */
#include <math.h>

double ldexp(double x, int n)
{
	return scalbn(x, n);
}
