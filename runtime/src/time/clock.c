/* Runtime library: clock (written for this library). The platform has no processor-time counter, so clock
 * measures wall time from the program's first call to clock, which returns 0; differences between calls are
 * what programs use. Returns (clock_t)-1 once the value no longer fits in clock_t. */
#include <time.h>
#include <limits.h>
#include "aed_sys.h"

clock_t clock(void)
{
	static long long start;
	static int started;
	long long now = __aed_time_ms(), ticks;

	if (!started) {
		start = now;
		started = 1;
	}
	ticks = (now - start) * (CLOCKS_PER_SEC / 1000);
	if (ticks > LONG_MAX) return (clock_t)-1;
	return ticks;
}
