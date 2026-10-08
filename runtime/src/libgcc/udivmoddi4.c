/* Runtime library: __udivmoddi4, unsigned 64-bit division with remainder for 32-bit Targets (written for this
 * library; see libgcc_impl.h). Dividing by zero gives an all-ones quotient and the dividend as remainder, the
 * RISC-V convention. */
#include "libgcc_impl.h"

du_int __udivmoddi4(du_int n, du_int d, du_int *rem)
{
	su_int nh = HI(n), nl = LO(n), dh = HI(d), dl = LO(d);
	du_int q;
	int sh, i;

	if (!dh && !dl) {
		if (rem) *rem = n;
		return ~(du_int)0;
	}
	if (!nh && !dh) {
		if (rem) *rem = nl % dl;
		return nl / dl;
	}
	if (n < d) {
		if (rem) *rem = n;
		return 0;
	}
	if (!dh && dl <= 0xffff) {
		/* Long division by 16-bit digits: every partial dividend fits in 32 bits. */
		su_int digit[4] = { nh >> 16, nh & 0xffff, nl >> 16, nl & 0xffff }, qd[4], r = 0;
		for (i = 0; i < 4; i++) {
			su_int cur = (r << 16) | digit[i];
			qd[i] = cur / dl;
			r = cur % dl;
		}
		if (rem) *rem = r;
		return MAKE64((qd[0] << 16) | qd[1], (qd[2] << 16) | qd[3]);
	}
	/* Shift and subtract, one quotient bit per step, from the divisor aligned under the dividend. */
	sh = __aed_clz64(d) - __aed_clz64(n);
	d = __aed_shl64(d, sh);
	q = 0;
	for (i = 0; i <= sh; i++) {
		q <<= 1;
		if (n >= d) {
			n -= d;
			q |= 1;
		}
		d >>= 1;
	}
	if (rem) *rem = n;
	return q;
}
