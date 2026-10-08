/* Derived from musl 1.2.6 src/math/__math_invalidf.c (MIT, see runtime/third_party/musl/COPYRIGHT). Unchanged apart from this comment. */
#include "libm.h"

float __math_invalidf(float x)
{
	return (x - x) / (x - x);
}
