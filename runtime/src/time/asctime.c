/* Derived from musl 1.2.6 src/time/asctime.c and src/time/asctime_r.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: day and month names come from local tables instead of nl_langinfo, out-of-range fields print as
 * "???", and a year that does not fit the 26-byte format is truncated instead of crashing. */
#include <time.h>
#include <stdio.h>

char *asctime(const struct tm *tm)
{
	static char buf[26];
	static const char days[] = "SunMonTueWedThuFriSat", months[] = "JanFebMarAprMayJunJulAugSepOctNovDec";
	const char *d = (unsigned)tm->tm_wday < 7 ? days + 3*tm->tm_wday : "???";
	const char *m = (unsigned)tm->tm_mon < 12 ? months + 3*tm->tm_mon : "???";

	snprintf(buf, sizeof buf, "%.3s %.3s%3d %.2d:%.2d:%.2d %d\n",
		d, m, tm->tm_mday, tm->tm_hour, tm->tm_min, tm->tm_sec, 1900 + tm->tm_year);
	return buf;
}
