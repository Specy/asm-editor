/* Runtime library: shared helpers for the compiler support routines (written for this library).
 *
 * GCC calls these routines on 32-bit Targets for 64-bit operations the hardware lacks. They must never use the
 * operation they implement: at -Os GCC turns a variable 64-bit shift into a call to __ashldi3, and any 64-bit
 * division into __udivdi3. So everything here works on 32-bit halves: only 32-bit shifts, 64-bit shifts by the
 * constant 32 (word moves), adds, subtracts, compares and 32x32->64 multiplies, all of which GCC inlines. */
#ifndef AED_LIBGCC_IMPL_H
#define AED_LIBGCC_IMPL_H

typedef unsigned int su_int;
typedef int si_int;
typedef unsigned long long du_int;
typedef long long di_int;

#define HI(x) ((su_int)((du_int)(x) >> 32))
#define LO(x) ((su_int)(x))
#define MAKE64(hi, lo) (((du_int)(su_int)(hi) << 32) | (su_int)(lo))

/* Leading zeros of a nonzero 32-bit value. */
static inline int __aed_clz32(su_int x)
{
	int n = 0;
	if (!(x & 0xffff0000u)) { n += 16; x <<= 16; }
	if (!(x & 0xff000000u)) { n += 8; x <<= 8; }
	if (!(x & 0xf0000000u)) { n += 4; x <<= 4; }
	if (!(x & 0xc0000000u)) { n += 2; x <<= 2; }
	if (!(x & 0x80000000u)) n += 1;
	return n;
}

/* Leading zeros of a nonzero 64-bit value. */
static inline int __aed_clz64(du_int x)
{
	return HI(x) ? __aed_clz32(HI(x)) : 32 + __aed_clz32(LO(x));
}

/* x << s and x >> s (logical) for 0 <= s <= 63, on 32-bit halves. */
static inline du_int __aed_shl64(du_int x, int s)
{
	su_int hi = HI(x), lo = LO(x);
	if (s >= 32) return MAKE64(lo << (s - 32), 0);
	if (s == 0) return x;
	return MAKE64((hi << s) | (lo >> (32 - s)), lo << s);
}

static inline du_int __aed_shr64(du_int x, int s)
{
	su_int hi = HI(x), lo = LO(x);
	if (s >= 32) return MAKE64(0, hi >> (s - 32));
	if (s == 0) return x;
	return MAKE64(hi >> s, (lo >> s) | (hi << (32 - s)));
}

/* The bit pattern of a double and back. */
static inline du_int __aed_dbits(double d)
{
	union { double d; du_int u; } v = { d };
	return v.u;
}

/* Converts a 64-bit unsigned value to float with one rounding. Values of 2^53 or more are first narrowed to
 * 53 bits with a sticky bit, so converting through double cannot round twice. */
static inline float __aed_u64_to_float(du_int u)
{
	int excess = 0;
	if (HI(u) >> 21) {
		excess = 11 - __aed_clz32(HI(u));
		u = __aed_shr64(u, excess) | ((LO(u) & ((1u << excess) - 1)) != 0);
	}
	/* u < 2^53 now, so this double is exact. */
	double d = (double)HI(u) * 4294967296.0 + (double)LO(u);
	if (excess) d *= (double)(1u << excess);
	return (float)d;
}

#endif
