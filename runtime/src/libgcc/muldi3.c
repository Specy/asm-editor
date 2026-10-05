/* Runtime library: __muldi3, 64-bit multiplication for 32-bit Targets (written for this library). */
#include "libgcc_impl.h"

di_int __muldi3(di_int a, di_int b)
{
	su_int al = LO(a), ah = HI(a), bl = LO(b), bh = HI(b);
	du_int low = (du_int)al * bl;
	return (di_int)MAKE64(HI(low) + al * bh + ah * bl, LO(low));
}
