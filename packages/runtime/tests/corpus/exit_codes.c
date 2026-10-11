/* _Exit ends the program at once: no atexit handlers run, and output written before it is not lost. */
#include <stdio.h>
#include <stdlib.h>

static void handler(void) { puts("handler must not run"); }

int main(void)
{
	atexit(handler);
	printf("EXIT_SUCCESS=%d EXIT_FAILURE=%d\n", EXIT_SUCCESS, EXIT_FAILURE);
	fflush(stdout);
	_Exit(EXIT_FAILURE + 41);
}
