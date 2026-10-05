/* Derived from musl 1.2.6 src/math/__math_invalid.c (MIT, see runtime/third_party/musl/COPYRIGHT). Unchanged apart from this comment. */
#include "libm.h"

double __math_invalid(double x)
{
	return (x - x) / (x - x);
}
