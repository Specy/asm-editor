/* Runtime library: time (written for this library). The platform clock counts milliseconds since 1970. */
#include <time.h>
#include "aed_sys.h"

time_t time(time_t *t)
{
	time_t now = __aed_time_ms() / 1000;
	if (t) *t = now;
	return now;
}
