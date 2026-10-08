/* Runtime library: __clzdi2, leading zero bits of a 64-bit value (64 for zero) (written for this library).
 * On 64-bit Targets GCC also uses it for 32-bit counts. */
#include "libgcc_impl.h"

int __clzdi2(du_int a)
{
	return a ? __aed_clz64(a) : 64;
}
