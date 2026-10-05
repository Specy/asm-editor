/* A typical exercise on strings: palindromes, reversing words, a Caesar cipher, counting vowels and converting
 * case, with <string.h> and <ctype.h>. */
#include <stdio.h>
#include <string.h>
#include <ctype.h>

static int is_palindrome(const char *s)
{
	size_t i = 0, j = strlen(s);
	while (i < j) {
		if (!isalnum((unsigned char)s[i])) { i++; continue; }
		if (!isalnum((unsigned char)s[j - 1])) { j--; continue; }
		if (tolower((unsigned char)s[i]) != tolower((unsigned char)s[j - 1])) return 0;
		i++;
		j--;
	}
	return 1;
}

static void caesar(char *s, int shift)
{
	for (; *s; s++) {
		if (isupper((unsigned char)*s)) *s = (char)('A' + (*s - 'A' + shift + 26) % 26);
		else if (islower((unsigned char)*s)) *s = (char)('a' + (*s - 'a' + shift + 26) % 26);
	}
}

int main(void)
{
	const char *tests[] = { "A man, a plan, a canal: Panama", "Hello", "Was it a car or a cat I saw?", "", "ab" };
	for (int i = 0; i < 5; i++) printf("\"%s\" palindrome=%d\n", tests[i], is_palindrome(tests[i]));
	char sentence[] = "the quick brown fox";
	char out[64] = "";
	char *words[8];
	int n = 0;
	for (char *w = strtok(sentence, " "); w && n < 8; w = strtok(NULL, " ")) words[n++] = w;
	while (n--) {
		strcat(out, words[n]);
		if (n) strcat(out, " ");
	}
	printf("reversed words: %s\n", out);
	char secret[] = "Attack at Dawn, 6 AM!";
	caesar(secret, 3);
	printf("encrypted: %s\n", secret);
	caesar(secret, -3);
	printf("decrypted: %s\n", secret);
	const char *text = "Programming in C is educational";
	int vowels = 0;
	for (const char *p = text; *p; p++) vowels += strchr("aeiouAEIOU", *p) != NULL;
	printf("vowels=%d\n", vowels);
	char upper[64];
	size_t i;
	for (i = 0; text[i]; i++) upper[i] = (char)toupper((unsigned char)text[i]);
	upper[i] = 0;
	printf("upper: %s\n", upper);
	return 0;
}
