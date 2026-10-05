/* Runtime library: __fixunsdfdi, double to unsigned 64-bit integer (truncating) for 32-bit Targets (written for
 * this library). Negative values give 0; values too large and NaN give the largest value, as RISC-V does. */
#include "libgcc_impl.h"

du_int __fixunsdfdi(double a)
{
	du_int bits = __aed_dbits(a), m;
	su_int hi = HI(bits);
	int e = (hi >> 20) & 0x7ff, s;

	if (e == 0x7ff && ((hi & 0xfffff) | LO(bits))) return ~(du_int)0;
	if (e < 0x3ff) return 0;
	if (hi >> 31) return 0;
	if (e >= 0x3ff + 64) return ~(du_int)0;
	m = MAKE64((hi & 0xfffff) | 0x100000, LO(bits));
	s = e - 0x3ff - 52;
	return s >= 0 ? __aed_shl64(m, s) : __aed_shr64(m, -s);
}
