// Runtime library: operator new(size_t, align_val_t, const nothrow_t &) (written for this library). One replaceable operator per file, so a program that
// replaces some of them never links a conflicting library definition.
// GCC calls it for `new (std::nothrow)` of a type aligned beyond __STDCPP_DEFAULT_NEW_ALIGNMENT__.
#include <new>
#include <stdlib.h>

void *operator new(std::size_t size, std::align_val_t alignment, const std::nothrow_t &) noexcept
{
	return aligned_alloc(static_cast<std::size_t>(alignment), size ? size : 1);
}
