/* Runtime library: __ctzsi2, trailing zero bits of a 32-bit value (32 for zero) (written for this library). */
#include "libgcc_impl.h"

int __ctzsi2(su_int a)
{
	int n = 0;
	if (!a) return 32;
	if (!(a & 0xffff)) { n += 16; a >>= 16; }
	if (!(a & 0xff)) { n += 8; a >>= 8; }
	if (!(a & 0xf)) { n += 4; a >>= 4; }
	if (!(a & 0x3)) { n += 2; a >>= 2; }
	if (!(a & 0x1)) n += 1;
	return n;
}
