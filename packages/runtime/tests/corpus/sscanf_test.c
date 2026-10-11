/* sscanf on strings: every conversion family, %n, suppression, literal text, end of string, and vsscanf
 * and vscanf-style forwarding through va_list wrappers. */
#include <stdio.h>
#include <stdarg.h>
#include <stdint.h>
#include <inttypes.h>

static int wrap_vsscanf(const char *s, const char *fmt, ...)
{
	va_list ap;
	va_start(ap, fmt);
	int r = vsscanf(s, fmt, ap);
	va_end(ap);
	return r;
}

int main(void)
{
	int a, b, c, n;
	unsigned u;
	double d;
	float f;
	char s1[32], s2[32];
	int r = sscanf("10 20 30", "%d %d %d", &a, &b, &c);
	printf("%d: %d %d %d\n", r, a, b, c);
	r = sscanf("key=value;42", "%31[^=]=%31[^;];%d", s1, s2, &a);
	printf("%d: [%s] [%s] %d\n", r, s1, s2, a);
	r = sscanf("3.5 -2e3 0x1p3", "%lf %f %lf", &d, &f, &d);
	printf("%d: %g %g\n", r, d, f);
	r = sscanf("0x7f 0777 1010", "%x %o %d%n", &a, &b, &c, &n);
	printf("%d: %d %d %d n=%d\n", r, a, b, c, n);
	r = sscanf("", "%d", &a);
	printf("empty: %d\n", r);
	r = sscanf("   ", "%d", &a);
	printf("blank: %d\n", r);
	r = sscanf("x", "%d", &a);
	printf("nonmatch: %d\n", r);
	r = sscanf("12abc", "%d%s", &a, s1);
	printf("%d: %d [%s]\n", r, a, s1);
	r = sscanf("  -0042xyz", "%i%n", &a, &n);
	printf("%d: %d n=%d\n", r, a, n);
	r = sscanf("4294967295", "%u", &u);
	printf("%d: %u\n", r, u);
	int64_t big;
	uint64_t ubig;
	r = sscanf("-9223372036854775808 18446744073709551615", "%" SCNd64 " %" SCNu64, &big, &ubig);
	printf("%d: %" PRId64 " %" PRIu64 "\n", r, big, ubig);
	r = sscanf("a,b,,c", "%31[^,],%31[^,],", s1, s2);
	printf("%d: [%s] [%s]\n", r, s1, s2);
	r = sscanf("100%", "%d%%", &a);
	printf("%d: %d\n", r, a);
	r = sscanf("date: 2024-02-29", "date: %d-%d-%d", &a, &b, &c);
	printf("%d: %04d/%02d/%02d\n", r, a, b, c);
	r = wrap_vsscanf("7 8 nine", "%d %d %31s", &a, &b, s1);
	printf("vsscanf %d: %d %d [%s]\n", r, a, b, s1);
	r = sscanf("1.5", "%d.%d", &a, &b);
	printf("%d: %d %d\n", r, a, b);
	r = sscanf("+", "%d", &a);
	printf("sign only: %d\n", r);
	return 0;
}
