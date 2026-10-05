/* Derived from musl 1.2.6 src/stdlib/imaxdiv.c (MIT, see runtime/third_party/musl/COPYRIGHT). Unchanged apart from this comment. */
#include <inttypes.h>

imaxdiv_t imaxdiv(intmax_t num, intmax_t den)
{
	return (imaxdiv_t){ num/den, num%den };
}
