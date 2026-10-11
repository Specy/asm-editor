#include <stdio.h>
static void check(const char *mode, const char *value) {
    FILE *f = fopen("update.txt", mode);
    if (!f) { puts("open failed"); return; }
    fputs(value, f); fflush(f); fseek(f, 0, SEEK_SET);
    char text[64] = {0}; fgets(text, sizeof text, f);
    printf("%s: %s\n", mode, text);
    fseek(f, 0, SEEK_SET); fputc('X', f); fclose(f);
}
int main(void) {
    check("w+", "abc"); check("r+", "def"); check("a+", "ghi");
    return 0;
}
