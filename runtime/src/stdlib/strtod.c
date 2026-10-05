/* Derived from musl 1.2.6 src/stdlib/strtod.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: computes in double (see floatscan.c); strtold is not provided. */
#include <stdlib.h>
#include "shgetc.h"
#include "floatscan.h"
#include "stdio_impl.h"

static double strtox(const char *s, char **p, int prec)
{
	FILE f;
	sh_fromstring(&f, s);
	shlim(&f, 0);
	double y = __floatscan(&f, prec, 1);
	off_t cnt = shcnt(&f);
	if (p) *p = cnt ? (char *)s + cnt : (char *)s;
	return y;
}

float strtof(const char *restrict s, char **restrict p)
{
	return strtox(s, p, 0);
}

double strtod(const char *restrict s, char **restrict p)
{
	return strtox(s, p, 1);
}
