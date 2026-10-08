/* Runtime library: __floatundisf, unsigned 64-bit integer to float for 32-bit Targets (written for this library). */
#include "libgcc_impl.h"

float __floatundisf(du_int a)
{
	return __aed_u64_to_float(a);
}
