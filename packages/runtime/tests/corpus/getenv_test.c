/* getenv: programs have no environment variables of their own, so an unset name gives NULL. */
#include <stdio.h>
#include <stdlib.h>

int main(void)
{
	printf("unset variable is NULL: %d\n", getenv("AED_RUNTIME_SURELY_UNSET") == NULL);
	printf("empty name is NULL: %d\n", getenv("") == NULL);
	return 0;
}
