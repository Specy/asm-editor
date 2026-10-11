/* Runtime library: __umoddi3, unsigned 64-bit remainder for 32-bit Targets (written for this library). */
#include "libgcc_impl.h"

du_int __udivmoddi4(du_int, du_int, du_int *);

du_int __umoddi3(du_int a, du_int b)
{
	du_int r;
	__udivmoddi4(a, b, &r);
	return r;
}
