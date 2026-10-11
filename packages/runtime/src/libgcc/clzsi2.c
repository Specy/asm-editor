/* Runtime library: __clzsi2, leading zero bits of a 32-bit value (32 for zero) (written for this library). */
#include "libgcc_impl.h"

int __clzsi2(su_int a)
{
	return a ? __aed_clz32(a) : 32;
}
