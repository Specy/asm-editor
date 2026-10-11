/* errno is set by failing library calls and left alone by successful ones. */
#include <stdio.h>
#include <stdlib.h>
#include <errno.h>
#include <math.h>

int main(void)
{
	printf("initial errno=%d\n", errno);
	errno = 0;
	strtol("99999999999999999999999", NULL, 10);
	printf("strtol overflow: ERANGE=%d\n", errno == ERANGE);
	errno = 0;
	strtod("1e999", NULL);
	printf("strtod overflow: ERANGE=%d\n", errno == ERANGE);
	errno = 0;
	strtod("1e-999", NULL);
	printf("strtod underflow: ERANGE=%d\n", errno == ERANGE);
	errno = 0;
	FILE *f = fopen("missing.txt", "r");
	printf("fopen missing: %d ENOENT=%d\n", f == NULL, errno == ENOENT);
	errno = 0;
	void *p = malloc(16);
	printf("malloc success keeps errno 0: %d\n", errno == 0);
	free(p);
	errno = 12345;
	strtol("42", NULL, 10);
	printf("success leaves errno: %d\n", errno);
	errno = 0;
	printf("errno is assignable lvalue: %d\n", (errno = EDOM) == EDOM);
	return 0;
}
