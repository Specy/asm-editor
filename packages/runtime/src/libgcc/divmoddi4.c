/* Runtime library: __divmoddi4, signed 64-bit division returning the quotient and storing the remainder, for
 * 32-bit Targets (written for this library). Newer GCCs call it when code needs both a / b and a % b. */
#include "libgcc_impl.h"

du_int __udivmoddi4(du_int, du_int, du_int *);

di_int __divmoddi4(di_int a, di_int b, di_int *rem)
{
	du_int ua = a < 0 ? -(du_int)a : (du_int)a;
	du_int ub = b < 0 ? -(du_int)b : (du_int)b;
	du_int r, q = __udivmoddi4(ua, ub, &r);
	if (rem) *rem = (di_int)(a < 0 ? -r : r);
	return (di_int)((a < 0) != (b < 0) ? -q : q);
}
