/* Empty standard input: every reading function reports the end at once. */
#include <stdio.h>

int main(void)
{
	char buf[16] = "unchanged";
	int x = 7;
	printf("getchar=%d\n", getchar());
	printf("feof=%d\n", feof(stdin) != 0);
	clearerr(stdin);
	const char *got = fgets(buf, sizeof buf, stdin) ? "line" : "NULL";
	printf("fgets=%s buf=%s\n", got, buf);
	clearerr(stdin);
	int r = scanf("%d", &x);
	printf("scanf=%d x=%d\n", r, x);
	clearerr(stdin);
	printf("fread=%zu\n", fread(buf, 1, sizeof buf, stdin));
	return 0;
}
