#include <stdio.h>
#include <string.h>

int main(void) {
    char input[64];

    puts("Enter the flag:");
    if (fgets(input, sizeof input, stdin) == NULL) {
        return 1;
    }
    input[strcspn(input, "\n")] = '\0';

    if (strcmp(input, "flag{read_the_pseudocode}") == 0) {
        puts("Flag accepted");
        return 0;
    }

    puts("Wrong flag");
    return 1;
}
