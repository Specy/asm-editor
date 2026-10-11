/* A typical exercise: count characters, words and lines of a File with fgetc, find the longest word and print
 * letter frequencies. */
#include <stdio.h>
#include <ctype.h>
#include <string.h>

int main(void)
{
	FILE *f = fopen("text.txt", "r");
	if (!f) {
		perror("text.txt");
		return 1;
	}
	int c, chars = 0, words = 0, lines = 0, in_word = 0, len = 0, best_len = 0;
	int freq[26] = { 0 };
	char word[64], best[64] = "";
	while ((c = fgetc(f)) != EOF) {
		chars++;
		if (c == '\n') lines++;
		if (isalpha(c)) {
			freq[tolower(c) - 'a']++;
			if (len < 63) word[len++] = (char)c;
			if (!in_word) {
				words++;
				in_word = 1;
			}
		} else {
			if (in_word && len > best_len) {
				word[len] = 0;
				strcpy(best, word);
				best_len = len;
			}
			in_word = 0;
			len = 0;
		}
	}
	fclose(f);
	printf("chars=%d words=%d lines=%d longest=%s (%d)\n", chars, words, lines, best, best_len);
	for (int i = 0; i < 26; i++)
		if (freq[i]) printf("%c:%d%s", 'a' + i, freq[i], i == 25 ? "" : " ");
	printf("\n");
	return 0;
}
