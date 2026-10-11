/* Derived from musl 1.2.6 src/math/__math_divzerof.c (MIT, see runtime/third_party/musl/COPYRIGHT). Unchanged apart from this comment. */
#include "libm.h"

float __math_divzerof(uint32_t sign)
{
	return fp_barrierf(sign ? -1.0f : 1.0f) / 0.0f;
}
