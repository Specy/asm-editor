/* freopen: reading stdin from a File, then sending stdout to a File. */
#include <stdio.h>

int main(void)
{
	printf("before freopen\n");
	if (!freopen("input.txt", "r", stdin)) { puts("freopen stdin failed"); return 1; }
	int a, b;
	char name[32];
	int r = scanf("%d %d %31s", &a, &b, name);
	printf("from file: r=%d %d+%d=%d %s\n", r, a, b, a + b, name);
	int c, rest = 0;
	while ((c = getchar()) != EOF) rest++;
	printf("rest=%d feof=%d\n", rest, feof(stdin) != 0);
	if (!freopen("stdout.txt", "w", stdout)) return 2;
	printf("this line goes to stdout.txt\n");
	puts("and this one");
	fprintf(stderr, "stderr still reaches the Terminal\n");
	return 0;
}
