/* <time.h>: time, clock, difftime, gmtime, localtime (UTC), mktime normalization, asctime and ctime. The
 * current time itself is only checked for plausibility. */
#include <stdio.h>
#include <time.h>

static void show(const char *label, const struct tm *t)
{
	printf("%s: %04d-%02d-%02d %02d:%02d:%02d wday=%d yday=%d isdst=%d\n", label, t->tm_year + 1900, t->tm_mon + 1,
		t->tm_mday, t->tm_hour, t->tm_min, t->tm_sec, t->tm_wday, t->tm_yday, t->tm_isdst);
}

int main(void)
{
	time_t stored = 0;
	time_t now = time(&stored);
	printf("time plausible=%d stored equals returned=%d\n", now > 1700000000LL, stored == now);
	printf("time(NULL) not before=%d\n", time(NULL) >= now);
	clock_t c1 = clock();
	volatile double sink = 0;
	for (int i = 0; i < 200000; i++) sink += i;
	clock_t c2 = clock();
	printf("clock non-decreasing=%d CLOCKS_PER_SEC=%ld\n", c2 >= c1 && c1 >= 0, (long)CLOCKS_PER_SEC);
	printf("difftime=%g %g\n", difftime(10, 3), difftime(0, 86400));
	time_t samples[] = { 0, 86399, 951782400, 951868800, 1234567890, 2147483647, 2147483648LL, 4102444800LL,
		-86400, -2208988800LL, 253402300799LL };
	for (unsigned i = 0; i < sizeof samples / sizeof *samples; i++) {
		char label[32];
		snprintf(label, sizeof label, "gmtime(%lld)", (long long)samples[i]);
		show(label, gmtime(&samples[i]));
	}
	time_t t = 1700000000;
	show("localtime", localtime(&t));
	struct tm tm = { 0 };
	tm.tm_year = 2024 - 1900;
	tm.tm_mon = 0;
	tm.tm_mday = 31 + 29 + 1;
	tm.tm_hour = 25;
	tm.tm_min = -30;
	tm.tm_isdst = -1;
	time_t m = mktime(&tm);
	printf("mktime=%lld\n", (long long)m);
	show("normalized", &tm);
	struct tm back = *gmtime(&now);
	printf("mktime(gmtime(now)) == now: %d\n", mktime(&back) == now);
	struct tm y2k = { .tm_year = 100, .tm_mon = 0, .tm_mday = 1 };
	printf("y2k=%lld\n", (long long)mktime(&y2k));
	struct tm month13 = { .tm_year = 99, .tm_mon = 13, .tm_mday = 1 };
	mktime(&month13);
	show("month 13", &month13);
	time_t epoch = 0;
	printf("asctime: %s", asctime(gmtime(&epoch)));
	time_t leap = 951782400;
	printf("ctime: %s", ctime(&leap));
	return 0;
}
