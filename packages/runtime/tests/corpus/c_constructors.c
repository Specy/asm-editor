/* runtime-test: skip-noinit (constructors run from crt0's .init_array loop, which the no-init start file skips)
 * GCC's constructor and destructor attributes: constructors run before main through .init_array, by priority;
 * destructors run from exit through .fini_array, after the atexit handlers. */
#include <stdio.h>
#include <stdlib.h>

static int ready;

__attribute__((constructor(200))) static void early(void) { puts("constructor 200"); ready = 1; }
__attribute__((constructor(300))) static void late(void) { printf("constructor 300 sees ready=%d\n", ready); }
__attribute__((destructor)) static void finish(void) { puts("destructor"); }

static void handler(void) { puts("atexit handler"); }

int main(void)
{
	atexit(handler);
	printf("main sees ready=%d\n", ready);
	return 0;
}
