#include <stdio.h>
int main(int argc, char **argv) {
    printf("valid argv=%d\n", argv != NULL && argv[argc] == NULL);
    return 0;
}
