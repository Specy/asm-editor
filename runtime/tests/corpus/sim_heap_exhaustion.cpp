/* Simulator-specific failure test. The native branch only supplies the hand-written expectation;
 * Linux overcommit does not give a reproducible heap limit. */
#include <stdio.h>
#include <stdlib.h>
#include <errno.h>
#include <new>
int main() {
#if defined(__mips__) || defined(__riscv)
    void *blocks[2048];
    unsigned count = 0;
    while (count < 2048 && (blocks[count] = malloc(4 * 1024 * 1024))) ++count;
    int failed = count < 2048 && errno == ENOMEM;
    char *p = new (std::nothrow) char[8 * 1024 * 1024];
    __asm__ __volatile__("" : : "r"(p) : "memory"); /* allocation must escape, so Clang cannot elide it */
    int nothrow = p == nullptr;
    delete[] p;
    while (count) free(blocks[--count]);
    void *small = malloc(32);
    printf("heap failure=%d nothrow=%d continue=%d\n", failed, nothrow, small != NULL);
    free(small);
#else
    puts("heap failure=1 nothrow=1 continue=1");
#endif
}
