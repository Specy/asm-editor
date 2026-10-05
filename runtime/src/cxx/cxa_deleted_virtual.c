/* Runtime library: __cxa_deleted_virtual (written for this library). C++ vtables point deleted virtual
 * functions at it; calling one prints a message and aborts. */
#include <stdio.h>
#include <stdlib.h>

void __cxa_deleted_virtual(void)
{
	fputs("deleted virtual method called\n", stderr);
	abort();
}
