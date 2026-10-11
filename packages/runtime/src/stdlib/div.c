/* Derived from musl 1.2.6 src/stdlib/div.c (MIT, see runtime/third_party/musl/COPYRIGHT). Unchanged apart from this comment. */
#include <stdlib.h>

div_t div(int num, int den)
{
	return (div_t){ num/den, num%den };
}
