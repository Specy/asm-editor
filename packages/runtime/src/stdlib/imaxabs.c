/* Derived from musl 1.2.6 src/stdlib/imaxabs.c (MIT, see runtime/third_party/musl/COPYRIGHT). Unchanged apart from this comment. */
#include <inttypes.h>

intmax_t imaxabs(intmax_t a)
{
	return a>0 ? a : -a;
}
