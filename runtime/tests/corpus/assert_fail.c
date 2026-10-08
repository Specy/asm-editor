/* A failing assert prints "Assertion failed: expr (file: function: line)" on stderr and aborts with status 134.
 * glibc words the message differently, so stderr is fixed in assert_fail.expect.stderr. */
#include <stdio.h>
#include <assert.h>

static void check(int x)
{
	assert(x == 2 && "x must be two");
}

int main(void)
{
	puts("checking 2");
	check(2);
	puts("checking 3");
	fflush(stdout);
	check(3);
	puts("not reached");
	return 0;
}
