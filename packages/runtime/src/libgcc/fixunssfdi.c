/* Runtime library: __fixunssfdi, float to unsigned 64-bit integer for 32-bit Targets (written for this library).
 * float to double is exact, so this is __fixunsdfdi. */
#include "libgcc_impl.h"

du_int __fixunsdfdi(double);

du_int __fixunssfdi(float a)
{
	return __fixunsdfdi(a);
}
