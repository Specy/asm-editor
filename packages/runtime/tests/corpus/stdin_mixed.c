/* Mixing scanf, fgets, getc, fgetc and ungetc on stdin: scanf("%d") leaves the newline for fgets, exactly as C does. */
#include <stdio.h>
#include <string.h>

int main(void)
{
	int n = 0;
	char line[64];
	scanf("%d", &n);
	printf("n=%d\n", n);
	fgets(line, sizeof line, stdin);
	printf("rest of line=[%s] len=%zu\n", strcmp(line, "\n") ? line : "\\n", strlen(line));
	fgets(line, sizeof line, stdin);
	line[strcspn(line, "\n")] = 0;
	printf("name=[%s]\n", line);
	int c = getc(stdin);
	printf("getc=%c\n", c);
	printf("ungetc=%c\n", ungetc('Z', stdin));
	printf("fgetc after ungetc=%c\n", fgetc(stdin));
	ungetc(c, stdin);
	scanf("%d", &n);
	printf("n after pushing back the digit=%d\n", n);
	printf("ungetc EOF=%d\n", ungetc(EOF, stdin));
	scanf(" %63[^\n]", line);
	printf("line=[%s]\n", line);
	int total = 0, x;
	while (scanf("%d", &x) == 1) total += x;
	printf("total=%d\n", total);
	return 0;
}
