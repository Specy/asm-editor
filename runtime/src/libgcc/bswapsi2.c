/* Runtime library: __bswapsi2, byte-swaps a 32-bit value (written for this library). */
#include "libgcc_impl.h"

si_int __bswapsi2(si_int a)
{
	su_int u = a;
	return (si_int)((u >> 24) | ((u >> 8) & 0xff00u) | ((u << 8) & 0xff0000u) | (u << 24));
}
