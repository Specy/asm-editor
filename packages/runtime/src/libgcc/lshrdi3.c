/* Runtime library: __lshrdi3, 64-bit logical shift right for 32-bit Targets (written for this library). */
#include "libgcc_impl.h"

di_int __lshrdi3(di_int a, int b)
{
	return (di_int)__aed_shr64((du_int)a, b & 63);
}
