// Runtime library: operator delete(void *, size_t) (written for this library). One replaceable operator per file, so a program that
// replaces some of them never links a conflicting library definition.
// GCC calls the sized form for complete types (C++14 sized deallocation); the size is not needed.
#include <new>

void operator delete(void *ptr, std::size_t) noexcept
{
	::operator delete(ptr);
}
