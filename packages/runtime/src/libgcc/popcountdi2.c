/* Runtime library: __popcountdi2, set bits in a 64-bit value (written for this library). On 64-bit Targets GCC
 * also uses it for 32-bit counts. */
#include "libgcc_impl.h"

int __popcountsi2(su_int);

int __popcountdi2(du_int a)
{
	return __popcountsi2(LO(a)) + __popcountsi2(HI(a));
}
