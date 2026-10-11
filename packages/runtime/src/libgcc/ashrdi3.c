/* Runtime library: __ashrdi3, 64-bit arithmetic shift right for 32-bit Targets (written for this library). */
#include "libgcc_impl.h"

di_int __ashrdi3(di_int a, int b)
{
	su_int hi = HI(a), lo = LO(a);
	b &= 63;
	if (b >= 32) return (di_int)MAKE64((si_int)hi >> 31, (si_int)hi >> (b - 32));
	if (b == 0) return a;
	return (di_int)MAKE64((si_int)hi >> b, (lo >> b) | (hi << (32 - b)));
}
