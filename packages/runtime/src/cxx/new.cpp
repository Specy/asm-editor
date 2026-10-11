// Runtime library: operator new(size_t) (written for this library). One replaceable operator per file, so a program that
// replaces some of them never links a conflicting library definition.
// Programs are compiled with -fno-exceptions, so running out of memory prints a message and aborts instead of
// throwing std::bad_alloc.
#include <new>
#include <stdio.h>
#include <stdlib.h>

void *operator new(std::size_t size)
{
	void *p = malloc(size ? size : 1);
	if (!p) {
		fputs("operator new: out of memory\n", stderr);
		abort();
	}
	return p;
}
