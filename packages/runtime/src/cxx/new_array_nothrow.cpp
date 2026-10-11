// Runtime library: operator new[](size_t, const nothrow_t &) (written for this library). One replaceable operator per file, so a program that
// replaces some of them never links a conflicting library definition.
#include <new>

void *operator new[](std::size_t size, const std::nothrow_t &tag) noexcept
{
	return ::operator new(size, tag);
}
