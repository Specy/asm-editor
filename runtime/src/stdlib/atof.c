/* Derived from musl 1.2.6 src/stdlib/atof.c (MIT, see runtime/third_party/musl/COPYRIGHT). Unchanged apart from this comment. */
#include <stdlib.h>

double atof(const char *s)
{
	return strtod(s, 0);
}
