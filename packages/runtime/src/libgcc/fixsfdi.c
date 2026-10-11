/* Runtime library: __fixsfdi, float to signed 64-bit integer for 32-bit Targets (written for this library).
 * float to double is exact, so this is __fixdfdi. */
#include "libgcc_impl.h"

di_int __fixdfdi(double);

di_int __fixsfdi(float a)
{
	return __fixdfdi(a);
}
