/* Derived from musl 1.2.6 src/math/__math_divzero.c (MIT, see runtime/third_party/musl/COPYRIGHT). Unchanged apart from this comment. */
#include "libm.h"

double __math_divzero(uint32_t sign)
{
	return fp_barrier(sign ? -1.0 : 1.0) / 0.0;
}
