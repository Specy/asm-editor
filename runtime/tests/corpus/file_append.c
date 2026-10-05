/* Appending: "a" adds to an existing File and creates a missing one; positions after appending. */
#include <stdio.h>

int main(void)
{
	FILE *f = fopen("log.txt", "a");
	fprintf(f, "appended line %d\n", 1);
	fputs("appended line 2\n", f);
	printf("ftell after appending=%ld\n", ftell(f));
	fclose(f);
	f = fopen("log.txt", "ab");
	fputc('!', f);
	fputc('\n', f);
	fclose(f);
	f = fopen("new.txt", "a");
	fputs("created by append\n", f);
	fclose(f);
	f = fopen("new.txt", "a");
	fputs("second append\n", f);
	fclose(f);
	f = fopen("log.txt", "r");
	char line[64];
	while (fgets(line, sizeof line, f)) printf("log: %s", line);
	fclose(f);
	return 0;
}
