/* Searching and splitting: strchr, strrchr, strstr (short and long needles), strspn, strcspn, strpbrk and
 * strtok (including several delimiters, empty fields and restarting). */
#include <stdio.h>
#include <string.h>

static void at(const char *label, const char *base, const char *p)
{
	if (p) printf("%s: %d\n", label, (int)(p - base));
	else printf("%s: NULL\n", label);
}

int main(void)
{
	const char *s = "hello, world; hello again";
	at("strchr o", s, strchr(s, 'o'));
	at("strchr NUL", s, strchr(s, '\0'));
	at("strchr missing", s, strchr(s, 'z'));
	at("strrchr o", s, strrchr(s, 'o'));
	at("strrchr h", s, strrchr(s, 'h'));
	at("strrchr NUL", s, strrchr(s, '\0'));
	at("strrchr missing", s, strrchr(s, 'q'));
	at("strstr hello", s, strstr(s, "hello"));
	at("strstr again", s, strstr(s, "again"));
	at("strstr empty", s, strstr(s, ""));
	at("strstr missing", s, strstr(s, "hellx"));
	at("strstr 2", s, strstr(s, "ld"));
	at("strstr 3", s, strstr(s, "; h"));
	at("strstr 4", s, strstr(s, "o ag"));
	const char *hay = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaabaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab";
	at("strstr long", hay, strstr(hay, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab"));
	at("strstr periodic", hay, strstr(hay, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab"));
	at("strstr longer than haystack", "abc", strstr("abc", "abcd"));
	printf("strspn: %zu %zu %zu\n", strspn("123abc", "0123456789"), strspn("abc", "xyz"), strspn("aaa", "a"));
	printf("strcspn: %zu %zu %zu\n", strcspn("hello world", " "), strcspn("abc", "xyz"), strcspn("abc", ""));
	at("strpbrk", s, strpbrk(s, ";,"));
	at("strpbrk missing", s, strpbrk(s, "XYZ"));
	char line[] = "  alpha, beta;;gamma ,delta  ";
	char *tok = strtok(line, " ,;");
	while (tok) {
		printf("token [%s]\n", tok);
		tok = strtok(NULL, " ,;");
	}
	printf("after end: %s\n", strtok(NULL, " ,;") ? "token" : "NULL");
	char csv[] = "a=1&b=22&c=333";
	for (char *pair = strtok(csv, "&"); pair; pair = strtok(NULL, "&")) printf("pair [%s]\n", pair);
	char only[] = ";;;";
	printf("only delimiters: %s\n", strtok(only, ";") ? "token" : "NULL");
	char changing[] = "x-y z";
	printf("first [%s]", strtok(changing, "-"));
	printf(" second [%s]\n", strtok(NULL, " "));
	return 0;
}
