/* Derived from musl 1.2.6 src/time/mktime.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: programs run in UTC, so there is no time-zone adjustment and tm_isdst becomes 0; time_t is 64-bit,
 * so no narrowing check. */
#include "time_impl.h"
#include <errno.h>

time_t mktime(struct tm *tm)
{
	struct tm new;
	long long t = __tm_to_secs(tm);

	if (__secs_to_tm(t, &new) < 0) goto error;
	new.tm_isdst = 0;

	*tm = new;
	return t;

error:
	errno = EOVERFLOW;
	return -1;
}
