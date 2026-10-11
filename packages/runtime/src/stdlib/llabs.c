/* Derived from musl 1.2.6 src/stdlib/llabs.c (MIT, see runtime/third_party/musl/COPYRIGHT). Unchanged apart from this comment. */
#include <stdlib.h>

long long llabs(long long a)
{
	return a>0 ? a : -a;
}
