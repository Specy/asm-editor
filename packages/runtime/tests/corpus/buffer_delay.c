/* runtime-test: skip-noinit (requested output buffering needs exit flush) */
#include <stdio.h>
static char buffer[128];
static long length(void) {
    FILE *f = fopen("delay.txt", "r");
    if (!f) return -1;
    fseek(f, 0, SEEK_END); long n = ftell(f); fclose(f); return n;
}
int main(void) {
    FILE *f = fopen("delay.txt", "w");
    int result = setvbuf(f, buffer, _IOFBF, sizeof buffer);
    fputs("abc", f);
    printf("buffering=%d before=%ld\n", result, length());
    fflush(f);
    printf("after=%ld\n", length());
    fclose(f);
    return 0;
}
