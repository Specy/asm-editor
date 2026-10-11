/* Runtime library: __udivdi3, unsigned 64-bit division for 32-bit Targets (written for this library). */
#include "libgcc_impl.h"

du_int __udivmoddi4(du_int, du_int, du_int *);

du_int __udivdi3(du_int a, du_int b)
{
	return __udivmoddi4(a, b, 0);
}
