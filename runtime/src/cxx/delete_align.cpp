// Runtime library: operator delete(void *, align_val_t) (written for this library). One replaceable operator per file, so a program that
// replaces some of them never links a conflicting library definition.
// aligned_alloc returns ordinary heap blocks, so free releases them.
#include <new>
#include <stdlib.h>

void operator delete(void *ptr, std::align_val_t) noexcept
{
	free(ptr);
}
