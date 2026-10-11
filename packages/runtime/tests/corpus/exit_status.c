/* exit from a nested function ends the program with its status after running atexit handlers; main's
 * return value is not reached. */
#include <stdio.h>
#include <stdlib.h>

static void handler(void) { puts("handler ran"); }

static void deep(int level)
{
	if (level == 3) {
		printf("exiting at level %d\n", level);
		exit(7);
	}
	if (level < 10) deep(level + 1);
}

int main(void)
{
	atexit(handler);
	deep(0);
	puts("not reached");
	return 1;
}
