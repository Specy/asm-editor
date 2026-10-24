#include <stdio.h>
#include <stdint.h>
#include <new>
// Over-aligned beyond __STDCPP_DEFAULT_NEW_ALIGNMENT__ on every Target, so new (std::nothrow) must
// reach the aligned nothrow operators rather than the plain nothrow ones.
struct alignas(64) Wide {
    int value;
    Wide() : value(7) {}
    ~Wide() { printf("~Wide %d\n", value); }
};
static int on(const void *p, uintptr_t alignment) { return p && (uintptr_t)p % alignment == 0; }
int main() {
    Wide *one = new (std::nothrow) Wide;
    Wide *many = new (std::nothrow) Wide[3];
    printf("nothrow aligned=%d array aligned=%d value=%d\n", on(one, 64), on(many, 64), one ? one->value : -1);
    if (many) many[2].value = 9;
    delete one;
    delete[] many;
    void *raw = ::operator new(100, std::align_val_t(128), std::nothrow);
    printf("operator new aligned=%d\n", on(raw, 128));
    ::operator delete(raw, std::align_val_t(128), std::nothrow);
    void *rows = ::operator new[](40, std::align_val_t(32), std::nothrow);
    printf("operator new[] aligned=%d\n", on(rows, 32));
    ::operator delete[](rows, std::align_val_t(32), std::nothrow);
}
