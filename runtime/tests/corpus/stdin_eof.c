/* Reading stdin to the end with getchar: counts, feof and ferror, EOF staying sticky until clearerr. */
#include <stdio.h>

int main(void)
{
	int c, chars = 0, lines = 0;
	while ((c = getchar()) != EOF) {
		chars++;
		if (c == '\n') lines++;
	}
	printf("chars=%d lines=%d feof=%d ferror=%d\n", chars, lines, feof(stdin) != 0, ferror(stdin) != 0);
	printf("again=%d\n", getchar());
	clearerr(stdin);
	printf("after clearerr feof=%d\n", feof(stdin) != 0);
	c = getchar();
	printf("read after clearerr=%d feof=%d\n", c, feof(stdin) != 0);
	char buf[8];
	printf("fgets at end=%s\n", fgets(buf, sizeof buf, stdin) ? "line" : "NULL");
	int x = 5;
	int r = scanf("%d", &x);
	printf("scanf at end=%d x=%d\n", r, x);
	return 0;
}
