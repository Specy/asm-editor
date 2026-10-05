/* Runtime library: fflush. Every stream writes through (each output call issues its write before returning),
 * so there is never anything to flush: fflush succeeds and changes nothing, for one stream or for NULL. */
#include <stdio.h>

int fflush(FILE *f)
{
	(void)f;
	return 0;
}
