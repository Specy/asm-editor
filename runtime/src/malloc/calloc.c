/* Runtime library: calloc (written for this library). The size computation is checked for overflow. */
#include <stdlib.h>
#include <string.h>
#include <errno.h>

void *calloc(size_t m, size_t n)
{
	void *p;

	if (n && m > (size_t)-1 / n) {
		errno = ENOMEM;
		return 0;
	}
	n *= m;
	p = malloc(n);
	if (p) memset(p, 0, n);
	return p;
}
