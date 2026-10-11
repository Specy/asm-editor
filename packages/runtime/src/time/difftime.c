/* Derived from musl 1.2.6 src/time/difftime.c (MIT, see runtime/third_party/musl/COPYRIGHT). Unchanged apart from this comment. */
#include <time.h>

double difftime(time_t t1, time_t t0)
{
	return t1-t0;
}
