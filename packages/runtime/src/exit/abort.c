/* Runtime library: abort (written for this library). The platform has no signals, so abort ends the program
 * with status 134, which is how a shell reports a SIGABRT death (128 + 6). It prints nothing and runs no
 * atexit handlers; there is no buffered output to lose. */
#include <stdlib.h>
#include "aed_sys.h"

_Noreturn void abort(void)
{
	__aed_exit(134);
}
