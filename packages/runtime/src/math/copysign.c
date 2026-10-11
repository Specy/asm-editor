/* Derived from musl 1.2.6 src/math/copysign.c (MIT, see runtime/third_party/musl/COPYRIGHT). Unchanged apart from this comment. */
#include "libm.h"

double copysign(double x, double y) {
	union {double f; uint64_t i;} ux={x}, uy={y};
	ux.i &= -1ULL/2;
	ux.i |= uy.i & 1ULL<<63;
	return ux.f;
}
