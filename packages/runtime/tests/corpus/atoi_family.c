/* atoi, atol and atoll: leading white space, signs, trailing junk and no digits at all. */
#include <stdio.h>
#include <stdlib.h>

int main(void)
{
	const char *s[] = { "42", "   -17", "+8", "12abc", "abc", "", " \t\n 99", "-0", "2147483647", "-2147483648", "007" };
	for (unsigned i = 0; i < sizeof s / sizeof *s; i++)
		printf("atoi(\"%s\")=%d atol=%ld atoll=%lld\n", s[i], atoi(s[i]), atol(s[i]), atoll(s[i]));
	printf("atoll big=%lld %lld\n", atoll("9223372036854775807"), atoll("-9223372036854775807"));
	return 0;
}
