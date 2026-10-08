/* sprintf, snprintf (truncation and the length it would have written), vsnprintf and vsprintf through wrappers,
 * %n with every length modifier, and very wide fields. */
#include <stdio.h>
#include <stdarg.h>
#include <string.h>

static int wrap_vsnprintf(char *buf, size_t n, const char *fmt, ...)
{
	va_list ap;
	va_start(ap, fmt);
	int r = vsnprintf(buf, n, fmt, ap);
	va_end(ap);
	return r;
}

static int wrap_vsprintf(char *buf, const char *fmt, ...)
{
	va_list ap;
	va_start(ap, fmt);
	int r = vsprintf(buf, fmt, ap);
	va_end(ap);
	return r;
}

static int wrap_vprintf(const char *fmt, ...)
{
	va_list ap;
	va_start(ap, fmt);
	int r = vprintf(fmt, ap);
	va_end(ap);
	return r;
}

static int wrap_vfprintf(FILE *f, const char *fmt, ...)
{
	va_list ap;
	va_start(ap, fmt);
	int r = vfprintf(f, fmt, ap);
	va_end(ap);
	return r;
}

int main(void)
{
	char buf[64];
	int r;
	/* volatile sizes keep GCC from diagnosing the deliberate truncation at compile time */
	volatile size_t six = 6, one = 1, zero = 0, ten = 10;
	r = sprintf(buf, "%d+%d=%d %s %.2f", 2, 3, 5, "ok", 1.0 / 3);
	printf("sprintf %d [%s]\n", r, buf);
	r = snprintf(buf, sizeof buf, "%s", "fits");
	printf("snprintf %d [%s]\n", r, buf);
	memset(buf, 'X', sizeof buf);
	r = snprintf(buf, six, "%s", "truncated text");
	printf("snprintf %d [%s] after=%c\n", r, buf, buf[6]);
	r = snprintf(buf, one, "%d", 12345);
	printf("snprintf n=1 %d [%s]\n", r, buf);
	r = snprintf(NULL, 0, "%d %s %f", 123456, "abc", 2.5);
	printf("snprintf NULL %d\n", r);
	buf[0] = '#';
	r = snprintf(buf, zero, "abc");
	printf("snprintf n=0 %d buf0=%c\n", r, buf[0]);
	r = wrap_vsnprintf(buf, ten, "%05d|%x|%s", 42, 0xbeef, "tail");
	printf("vsnprintf %d [%s]\n", r, buf);
	r = wrap_vsprintf(buf, "%-6s|%6s|%c", "ab", "cd", 'e');
	printf("vsprintf %d [%s]\n", r, buf);
	r = wrap_vprintf("vprintf %s %d %.1f\n", "x", 1, 1.5);
	printf("vprintf returned %d\n", r);
	r = wrap_vfprintf(stderr, "vfprintf to stderr %d\n", 99);
	printf("vfprintf returned %d\n", r);

	int n1 = -1, n2 = -1;
	short sn = -1;
	signed char cn = -1;
	long ln = -1;
	long long lln = -1;
	size_t zn = 99;
	printf("abc%n defgh%n|%hn%hhn%ln%lln%zn\n", &n1, &n2, &sn, &cn, &ln, &lln, &zn);
	printf("n: %d %d %d %d %ld %lld %zu\n", n1, n2, sn, cn, ln, lln, zn);
	r = printf("%300d|\n", 1);
	printf("wide returned %d\n", r);
	r = printf("%-300s|%.300d|\n", "left", 2);
	printf("wide returned %d\n", r);
	r = printf("%.400f\n", 1.0 / 7);
	printf("long returned %d\n", r);
	return 0;
}
