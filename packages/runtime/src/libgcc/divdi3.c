/* Runtime library: __divdi3, signed 64-bit division (truncating) for 32-bit Targets (written for this library). */
#include "libgcc_impl.h"

du_int __udivmoddi4(du_int, du_int, du_int *);

di_int __divdi3(di_int a, di_int b)
{
	du_int ua = a < 0 ? -(du_int)a : (du_int)a;
	du_int ub = b < 0 ? -(du_int)b : (du_int)b;
	du_int q = __udivmoddi4(ua, ub, 0);
	return (di_int)((a < 0) != (b < 0) ? -q : q);
}
