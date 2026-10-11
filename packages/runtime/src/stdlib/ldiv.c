/* Derived from musl 1.2.6 src/stdlib/ldiv.c (MIT, see runtime/third_party/musl/COPYRIGHT). Unchanged apart from this comment. */
#include <stdlib.h>

ldiv_t ldiv(long num, long den)
{
	return (ldiv_t){ num/den, num%den };
}
