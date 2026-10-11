/* Runtime library: __ashldi3, 64-bit shift left for 32-bit Targets (written for this library). */
#include "libgcc_impl.h"

di_int __ashldi3(di_int a, int b)
{
	return (di_int)__aed_shl64((du_int)a, b & 63);
}
