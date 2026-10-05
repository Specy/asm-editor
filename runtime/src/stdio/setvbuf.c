/* Runtime library: setvbuf. Every stream writes through, so a buffering request with a valid mode succeeds and
 * changes nothing; an invalid mode fails, as in musl. */
#include <stdio.h>

int setvbuf(FILE *restrict f, char *restrict buf, int type, size_t size)
{
	(void)f;
	(void)buf;
	(void)size;
	return type == _IONBF || type == _IOLBF || type == _IOFBF ? 0 : -1;
}
