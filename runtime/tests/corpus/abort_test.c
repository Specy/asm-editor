/* abort ends the program abnormally: status 134 (a shell's view of SIGABRT), no atexit handlers. */
#include <stdio.h>
#include <stdlib.h>

static void handler(void) { puts("handler must not run"); }

int main(void)
{
	atexit(handler);
	fprintf(stderr, "about to abort\n");
	abort();
}
