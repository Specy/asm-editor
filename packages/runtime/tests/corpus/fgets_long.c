/* fgets with lines longer than the buffer, a buffer of 1, and a last line without a newline in a File. */
#include <stdio.h>
#include <string.h>

int main(void)
{
	char buf[8];
	int pieces = 0;
	while (fgets(buf, sizeof buf, stdin)) {
		size_t len = strlen(buf);
		printf("%d:%zu:[%.*s]%s\n", pieces++, len, (int)(len && buf[len - 1] == '\n' ? len - 1 : len), buf,
			len && buf[len - 1] == '\n' ? " NL" : "");
	}
	printf("pieces=%d\n", pieces);
	FILE *f = fopen("noeol.txt", "w");
	fputs("one\ntwo without newline", f);
	fclose(f);
	f = fopen("noeol.txt", "r");
	char big[64];
	while (fgets(big, sizeof big, f)) printf("[%s]\n", big);
	char one[1];
	f = freopen("noeol.txt", "r", f);
	const char *got = fgets(one, 1, f) ? "ok" : "NULL";
	printf("fgets n=1: %s first=%d\n", got, one[0]);
	fclose(f);
	return 0;
}
