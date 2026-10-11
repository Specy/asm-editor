/* Runtime library: __cxa_pure_virtual (written for this library). C++ vtables point pure virtual functions at
 * it; calling one (from a constructor or destructor) prints a message and aborts. */
#include <stdio.h>
#include <stdlib.h>

void __cxa_pure_virtual(void)
{
	fputs("pure virtual method called\n", stderr);
	abort();
}
