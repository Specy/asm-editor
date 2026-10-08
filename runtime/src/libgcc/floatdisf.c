/* Runtime library: __floatdisf, signed 64-bit integer to float for 32-bit Targets (written for this library). */
#include "libgcc_impl.h"

float __floatdisf(di_int a)
{
	float f = __aed_u64_to_float(a < 0 ? -(du_int)a : (du_int)a);
	return a < 0 ? -f : f;
}
