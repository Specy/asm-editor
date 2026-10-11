/* Runtime library: __popcountsi2, set bits in a 32-bit value (written for this library). */
#include "libgcc_impl.h"

int __popcountsi2(su_int a)
{
	a = a - ((a >> 1) & 0x55555555u);
	a = (a & 0x33333333u) + ((a >> 2) & 0x33333333u);
	a = (a + (a >> 4)) & 0x0f0f0f0fu;
	return (a * 0x01010101u) >> 24;
}
