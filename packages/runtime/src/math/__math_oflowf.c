/* Derived from musl 1.2.6 src/math/__math_oflowf.c (MIT, see runtime/third_party/musl/COPYRIGHT). Unchanged apart from this comment. */
#include "libm.h"

float __math_oflowf(uint32_t sign)
{
	return __math_xflowf(sign, 0x1p97f);
}
