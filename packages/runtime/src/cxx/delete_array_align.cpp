// Runtime library: operator delete[](void *, align_val_t) (written for this library). One replaceable operator per file, so a program that
// replaces some of them never links a conflicting library definition.
#include <new>

void operator delete[](void *ptr, std::align_val_t alignment) noexcept
{
	::operator delete(ptr, alignment);
}
