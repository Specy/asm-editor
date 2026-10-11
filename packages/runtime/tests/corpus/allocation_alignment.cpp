#include <stdio.h>
#include <stdlib.h>
#include <stddef.h>
#include <stdint.h>
#include <new>
struct alignas(16) A { char data[16]; };
static int aligned(const void *p) { return p && (uintptr_t)p % alignof(max_align_t) == 0; }
int main() {
    void *p = malloc(1), *c = calloc(3, 7);
    printf("malloc aligned=%d calloc aligned=%d\n", aligned(p), aligned(c));
    p = realloc(p, 73);
    printf("realloc aligned=%d\n", aligned(p));
    A *a = new A, *array = new A[3];
    printf("new aligned=%d array aligned=%d alignas16=%d\n", aligned(a), aligned(array), (uintptr_t)a % 16 == 0);
    free(p); free(c); delete a; delete[] array;
}
