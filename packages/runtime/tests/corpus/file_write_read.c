/* Writing a File with every output function, then reading it back with every input function. */
#include <stdio.h>
#include <string.h>

int main(void)
{
	FILE *f = fopen("out.txt", "w");
	if (!f) { puts("fopen w failed"); return 1; }
	printf("fprintf=%d\n", fprintf(f, "line %d: %s %.2f\n", 1, "fprintf", 3.14159));
	printf("fputs=%d\n", fputs("line 2: fputs\n", f) >= 0);
	printf("fputc=%d\n", fputc('L', f));
	printf("putc=%d\n", putc('3', f));
	fputc('\n', f);
	printf("fwrite=%zu\n", fwrite("line 4: fwrite\n", 1, 15, f));
	printf("ftell=%ld\n", ftell(f));
	printf("fclose=%d\n", fclose(f));

	f = fopen("out.txt", "r");
	if (!f) { puts("fopen r failed"); return 1; }
	char line[64];
	int c1 = fgetc(f);
	int c2 = getc(f);
	printf("fgetc=%c getc=%c\n", c1, c2);
	while (fgets(line, sizeof line, f)) printf("fgets: %s", line);
	printf("feof=%d ferror=%d\n", feof(f) != 0, ferror(f) != 0);
	printf("fgetc at end=%d\n", fgetc(f));
	rewind(f);
	printf("after rewind feof=%d\n", feof(f) != 0);
	char buf[128];
	size_t n = fread(buf, 1, sizeof buf, f);
	printf("fread=%zu feof=%d\n", n, feof(f) != 0);
	fwrite(buf, 1, n, stdout);
	rewind(f);
	char words[3][16];
	int got = fscanf(f, "%15s %15s %15s", words[0], words[1], words[2]);
	printf("fscanf=%d [%s] [%s] [%s]\n", got, words[0], words[1], words[2]);
	fclose(f);

	/* Overwriting truncates. */
	f = fopen("out2.txt", "w");
	fputs("a long first version of the file\n", f);
	fclose(f);
	f = fopen("out2.txt", "w");
	fputs("short\n", f);
	fclose(f);
	f = fopen("out2.txt", "r");
	printf("after truncation: %s", fgets(line, sizeof line, f));
	fclose(f);

	/* An empty File. */
	f = fopen("empty.txt", "w");
	fclose(f);
	f = fopen("empty.txt", "r");
	c1 = fgetc(f);
	printf("empty: fgetc=%d feof=%d\n", c1, feof(f) != 0);
	fclose(f);
	return 0;
}
