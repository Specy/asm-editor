/* Runtime library: __bswapdi2, byte-swaps a 64-bit value (written for this library). */
#include "libgcc_impl.h"

si_int __bswapsi2(si_int);

di_int __bswapdi2(di_int a)
{
	return (di_int)MAKE64(__bswapsi2(LO(a)), __bswapsi2(HI(a)));
}
