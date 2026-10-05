// Runtime library: operator delete[](void *) (written for this library). One replaceable operator per file, so a program that
// replaces some of them never links a conflicting library definition.
#include <new>

void operator delete[](void *ptr) noexcept
{
	::operator delete(ptr);
}
