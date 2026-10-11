/* Runtime library: __fixdfdi, double to signed 64-bit integer (truncating) for 32-bit Targets (written for this
 * library). Out-of-range values saturate and NaN gives the largest value, as RISC-V's fcvt.l.d does. */
#include "libgcc_impl.h"

di_int __fixdfdi(double a)
{
	du_int bits = __aed_dbits(a), m;
	su_int hi = HI(bits);
	int e = (hi >> 20) & 0x7ff, neg = hi >> 31, s;

	if (e == 0x7ff && ((hi & 0xfffff) | LO(bits))) return 0x7fffffffffffffffLL;
	if (e < 0x3ff) return 0;
	if (e >= 0x3ff + 63) return neg ? (di_int)0x8000000000000000ULL : 0x7fffffffffffffffLL;
	m = MAKE64((hi & 0xfffff) | 0x100000, LO(bits));
	s = e - 0x3ff - 52;
	m = s >= 0 ? __aed_shl64(m, s) : __aed_shr64(m, -s);
	return neg ? (di_int)-m : (di_int)m;
}
