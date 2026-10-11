/* scanf string conversions: %s with widths, %c (whitespace kept, counts), scansets %[...] with ranges,
 * negation, ']' and '-', %n, suppression, and what is left unread afterwards. Each case starts on a new line. */
#include <stdio.h>
#include <string.h>

static void skip_line(void)
{
	int c;
	while ((c = getchar()) != '\n' && c != EOF);
}

int main(void)
{
	char a[32], b[32], c[32];
	char ch[8];
	int r, n1 = -1, n2 = -1;
	r = scanf("%s %s", a, b);
	printf("1: r=%d [%s] [%s]\n", r, a, b);
	r = scanf("%5s%s", a, b);
	printf("2: r=%d [%s] [%s]\n", r, a, b);
	memset(ch, 0, sizeof ch);
	r = scanf("%c", ch);
	printf("3: r=%d [%d]\n", r, ch[0]);
	memset(ch, 0, sizeof ch);
	r = scanf("%3c", ch);
	printf("4: r=%d [%s]\n", r, ch);
	r = scanf(" %c", ch);
	printf("5: r=%d [%c]\n", r, ch[0]);
	skip_line();
	r = scanf("%[a-z]%[0-9]", a, b);
	printf("6: r=%d [%s] [%s]\n", r, a, b);
	skip_line();
	r = scanf("%[^,\n],%[^\n]", a, b);
	printf("7: r=%d [%s] [%s]\n", r, a, b);
	skip_line();
	r = scanf("%[]abc]%[a-]", a, b);
	printf("8: r=%d [%s] [%s]\n", r, a, b);
	skip_line();
	r = scanf("%*s %n%s%n", &n1, c, &n2);
	printf("9: r=%d [%s] n1=%d n2=%d\n", r, c, n1, n2);
	skip_line();
	r = scanf("%[0-9]", a);
	printf("10: r=%d (no digits), next char '%c'\n", r, getchar());
	skip_line();
	r = scanf("%31[^\n]", a);
	printf("11: r=%d [%s]\n", r, a);
	r = scanf("%c", ch);
	printf("12: r=%d [%d]\n", r, ch[0]);
	r = scanf("%3[a-z]", a);
	printf("13: r=%d [%s]\n", r, a);
	r = scanf("%s", a);
	printf("14: r=%d [%s]\n", r, a);
	r = scanf("%s", a);
	printf("15: r=%d at end\n", r);
	return 0;
}
