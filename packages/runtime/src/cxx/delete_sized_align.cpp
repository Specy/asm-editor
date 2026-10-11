// Runtime library: operator delete(void *, size_t, align_val_t) (written for this library). One replaceable operator per file, so a program that
// replaces some of them never links a conflicting library definition.
#include <new>

void operator delete(void *ptr, std::size_t, std::align_val_t alignment) noexcept
{
	::operator delete(ptr, alignment);
}
