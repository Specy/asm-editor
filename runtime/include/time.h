/* Runtime library, ABI v1: <time.h>. Programs run in UTC: localtime is gmtime and mktime reads its argument as UTC. */
#ifndef _TIME_H
#define _TIME_H

#ifdef __cplusplus
extern "C" {
#endif

typedef __SIZE_TYPE__ size_t;
typedef long long time_t;
typedef long clock_t;

struct tm {
	int tm_sec;
	int tm_min;
	int tm_hour;
	int tm_mday;
	int tm_mon;
	int tm_year;
	int tm_wday;
	int tm_yday;
	int tm_isdst;
};

#ifndef NULL
#ifdef __cplusplus
#define NULL __null
#else
#define NULL ((void *)0)
#endif
#endif

#define CLOCKS_PER_SEC 1000000L

/** Returns the current time in seconds since 1970-01-01 UTC and also stores it in *t when t is not NULL. */
time_t time(time_t *t);
/** Returns processor time in CLOCKS_PER_SEC units; simulator instructions run at nominal 100 MHz. Returns -1 on overflow. */
clock_t clock(void);
/** Returns end - start in seconds. */
double difftime(time_t end, time_t start);
/** Normalizes the fields of *tm, read as UTC, and returns the matching time_t, or -1 if it cannot be represented. */
time_t mktime(struct tm *tm);
/** Breaks *t into UTC calendar fields stored in a static struct tm and returns it, or NULL on overflow. */
struct tm *gmtime(const time_t *t);
/** Same as gmtime: programs run in UTC. */
struct tm *localtime(const time_t *t);
/** Formats *tm as "Www Mmm dd hh:mm:ss yyyy\n" in a static buffer and returns it. */
char *asctime(const struct tm *tm);
/** Formats the time *t like asctime(localtime(t)). */
char *ctime(const time_t *t);

#ifdef __cplusplus
}
#endif

#endif
