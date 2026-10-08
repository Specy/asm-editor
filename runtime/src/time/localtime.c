/* Runtime library: localtime (written for this library). Programs run in UTC, so local time is gmtime's,
 * in the same static struct tm. */
#include <time.h>

struct tm *localtime(const time_t *t)
{
	return gmtime(t);
}
