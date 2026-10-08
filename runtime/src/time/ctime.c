/* Derived from musl 1.2.6 src/time/ctime.c (MIT, see runtime/third_party/musl/COPYRIGHT). Unchanged apart from this comment. */
#include <time.h>

char *ctime(const time_t *t)
{
	struct tm *tm = localtime(t);
	if (!tm) return 0;
	return asctime(tm);
}
