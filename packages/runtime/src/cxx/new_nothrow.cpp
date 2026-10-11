// Runtime library: operator new(size_t, const nothrow_t &) (written for this library). One replaceable operator per file, so a program that
// replaces some of them never links a conflicting library definition.
#include <new>
#include <stdlib.h>

void *operator new(std::size_t size, const std::nothrow_t &) noexcept
{
	return malloc(size ? size : 1);
}
