/* Runtime library: getenv (written for this library). Programs have no environment, so it always returns NULL. */
#include <stdlib.h>

char *getenv(const char *name)
{
	(void)name;
	return 0;
}
