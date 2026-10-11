/* Derived from musl 1.2.6 src/time/gmtime.c and src/time/gmtime_r.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: struct tm has only the standard fields, so no time-zone fields are set; gmtime_r is not provided. */
#include "time_impl.h"
#include <errno.h>

struct tm *gmtime(const time_t *t)
{
	static struct tm tm;
	if (__secs_to_tm(*t, &tm) < 0) {
		errno = EOVERFLOW;
		return 0;
	}
	tm.tm_isdst = 0;
	return &tm;
}
