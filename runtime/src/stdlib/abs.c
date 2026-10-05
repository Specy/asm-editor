/* Derived from musl 1.2.6 src/stdlib/abs.c (MIT, see runtime/third_party/musl/COPYRIGHT). Unchanged apart from this comment. */
#include <stdlib.h>

int abs(int a)
{
	return a>0 ? a : -a;
}
