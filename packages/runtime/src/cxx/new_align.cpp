// Runtime library: operator new(size_t, align_val_t) (written for this library). One replaceable operator per file, so a program that
// replaces some of them never links a conflicting library definition.
// GCC calls it for types aligned beyond __STDCPP_DEFAULT_NEW_ALIGNMENT__. Running out of memory aborts.
#include <new>
#include <stdio.h>
#include <stdlib.h>

void *operator new(std::size_t size, std::align_val_t alignment)
{
	void *p = aligned_alloc(static_cast<std::size_t>(alignment), size ? size : 1);
	if (!p) {
		fputs("operator new: out of memory\n", stderr);
		abort();
	}
	return p;
}
