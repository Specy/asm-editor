/* runtime-test: skip-noinit (the handlers run from exit, which the no-init start file never calls)
 * atexit handlers run in reverse order of registration when main returns, after its output. */
#include <stdio.h>
#include <stdlib.h>

static void first(void) { puts("first registered, runs last"); }
static void second(void) { puts("second registered"); }
static void third(void) { printf("third registered, runs first\n"); }

int main(void)
{
	printf("atexit=%d\n", atexit(first));
	printf("atexit=%d\n", atexit(second));
	printf("atexit=%d\n", atexit(third));
	int ok = 0;
	for (int i = 0; i < 40; i++) ok += atexit(second) == 0;
	printf("40 more registered=%d\n", ok);
	puts("main returns");
	return 0;
}
