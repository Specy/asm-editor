/* strtol, strtoul, strtoll, strtoull, strtoimax and strtoumax: bases 0 and 2-36, prefixes, signs, end
 * pointers, overflow with ERANGE, and invalid input. Values stay within 32 bits for long so the output does
 * not depend on the data model. */
#include <stdio.h>
#include <stdlib.h>
#include <errno.h>
#include <limits.h>
#include <inttypes.h>

static void l(const char *s, int base)
{
	char *end = (char *)s; /* glibc leaves it unset for an invalid base */
	errno = 0;
	long v = strtol(s, &end, base);
	printf("strtol(%-14s,%2d) = %ld end=+%d errno=%d\n", s, base, v, (int)(end - s), errno);
}

static void ul(const char *s, int base)
{
	char *end = (char *)s; /* glibc leaves it unset for an invalid base */
	errno = 0;
	unsigned long v = strtoul(s, &end, base);
	printf("strtoul(%-14s,%2d) = %lu end=+%d errno=%d\n", s, base, v, (int)(end - s), errno);
}

static void ll(const char *s, int base)
{
	char *end = (char *)s; /* glibc leaves it unset for an invalid base */
	errno = 0;
	long long v = strtoll(s, &end, base);
	printf("strtoll(%-22s,%2d) = %lld end=+%d errno=%d\n", s, base, v, (int)(end - s), errno);
}

static void ull(const char *s, int base)
{
	char *end = (char *)s; /* glibc leaves it unset for an invalid base */
	errno = 0;
	unsigned long long v = strtoull(s, &end, base);
	printf("strtoull(%-22s,%2d) = %llu end=+%d errno=%d\n", s, base, v, (int)(end - s), errno);
}

int main(void)
{
	l("123", 10); l("  -456xyz", 10); l("+0", 10); l("0x1f", 0); l("0x1f", 16); l("1f", 16); l("017", 0);
	l("017", 10); l("0b101", 0); l("101", 2); l("zz", 36); l("Zz", 36); l("777", 8); l("8", 8); l("", 10);
	l("   ", 10); l("-", 10); l("0x", 0); l("0x", 16); l("0xg", 16); l("2147483647", 10); l("-2147483648", 10);
	l("12", 1); l("12", 37);
	ul("4294967295", 10); ul("  +17", 0); ul("0X7fffFFFF", 0); ul("1010", 2);
	ll("9223372036854775807", 10); ll("-9223372036854775808", 10); ll("9223372036854775808", 10);
	ll("-9223372036854775809", 10); ll("99999999999999999999999", 10); ll("0x7fffffffffffffff", 0);
	ll("-0x8000000000000000", 16); ll("1y2", 36);
	ull("18446744073709551615", 10); ull("18446744073709551616", 10); ull("-1", 10); ull("0xffffffffffffffff", 0);
	ull("01777777777777777777777", 0);
	printf("strtoul(\"-1\") is ULONG_MAX: %d\n", strtoul("-1", NULL, 10) == ULONG_MAX);
	char *end;
	errno = 0;
	long big = strtol("99999999999999999999999", &end, 10);
	printf("strtol overflow: is LONG_MAX=%d errno=%d end=+%d\n", big == LONG_MAX, errno, (int)(end - "99999999999999999999999"));
	errno = 0;
	long small = strtol("-99999999999999999999999", NULL, 10);
	printf("strtol underflow: is LONG_MIN=%d errno=%d\n", small == LONG_MIN, errno);
	errno = 0;
	unsigned long ubig = strtoul("99999999999999999999999", NULL, 10);
	printf("strtoul overflow: is ULONG_MAX=%d errno=%d\n", ubig == ULONG_MAX, errno);
	intmax_t im = strtoimax("-123456789012", &end, 10);
	uintmax_t um = strtoumax("0xFFFFFFFFFF", &end, 16);
	printf("strtoimax=%" PRIdMAX " strtoumax=%" PRIuMAX "\n", im, um);
	printf("imaxabs=%" PRIdMAX " imaxdiv=%" PRIdMAX ",%" PRIdMAX "\n", imaxabs(-42), imaxdiv(-17, 5).quot, imaxdiv(-17, 5).rem);
	return 0;
}
