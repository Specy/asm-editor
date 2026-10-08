/* Derived from musl 1.2.6 src/exit/_Exit.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: ends the program with the platform's exit service. */
#include <stdlib.h>
#include "aed_sys.h"

_Noreturn void _Exit(int ec)
{
	__aed_exit(ec);
}
