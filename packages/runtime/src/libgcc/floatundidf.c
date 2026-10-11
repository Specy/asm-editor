/* Runtime library: __floatundidf, unsigned 64-bit integer to double for 32-bit Targets (written for this library).
 * Both halves convert exactly, so the one rounding of the final addition gives the correctly rounded result. */
#include "libgcc_impl.h"

double __floatundidf(du_int a)
{
	return (double)HI(a) * 4294967296.0 + (double)LO(a);
}
