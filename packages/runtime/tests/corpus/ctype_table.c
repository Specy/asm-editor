/* Every <ctype.h> function on EOF and all unsigned char values, printed as a table. In the "C" locale values
 * above 127 belong to no class. */
#include <stdio.h>
#include <ctype.h>

int main(void)
{
	printf("    c  alnum alpha blank cntrl digit graph lower print punct space upper xdigit  lower upper\n");
	for (int c = -1; c < 256; c++) {
		printf("%5d %d%d%d%d%d%d%d%d%d%d%d%d %4d %4d\n", c, !!isalnum(c), !!isalpha(c), !!isblank(c), !!iscntrl(c),
			!!isdigit(c), !!isgraph(c), !!islower(c), !!isprint(c), !!ispunct(c), !!isspace(c), !!isupper(c),
			!!isxdigit(c), tolower(c), toupper(c));
	}
	return 0;
}
