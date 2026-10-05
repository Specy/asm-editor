/* Derived from musl 1.2.6 src/math/__math_uflow.c (MIT, see runtime/third_party/musl/COPYRIGHT). Unchanged apart from this comment. */
#include "libm.h"

double __math_uflow(uint32_t sign)
{
	return __math_xflow(sign, 0x1p-767);
}
