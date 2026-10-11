/* Runtime library: __ctzdi2, trailing zero bits of a 64-bit value (64 for zero) (written for this library). */
#include "libgcc_impl.h"

int __ctzsi2(su_int);

int __ctzdi2(du_int a)
{
	return LO(a) ? __ctzsi2(LO(a)) : 32 + __ctzsi2(HI(a));
}
