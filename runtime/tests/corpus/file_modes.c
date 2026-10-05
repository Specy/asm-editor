/* Mode strings: "r", "w", "a" with "b", and the "+" modes used the way the Cores support them ("r+" for
 * reading, "w+" for writing, "a+" for appending; a stream cannot both read and write a File). */
#include <stdio.h>

static void show(const char *name)
{
	FILE *f = fopen(name, "rb");
	int c;
	printf("%s: [", name);
	while ((c = fgetc(f)) != EOF) putchar(c == '\n' ? '|' : c);
	printf("]\n");
	fclose(f);
}

int main(void)
{
	FILE *f = fopen("plus.txt", "w+");
	fputs("written with w+\n", f);
	fclose(f);
	show("plus.txt");
	f = fopen("plus.txt", "r+");
	char line[32];
	printf("r+ reads: %s", fgets(line, sizeof line, f));
	fclose(f);
	f = fopen("plus.txt", "a+");
	fputs("appended with a+\n", f);
	fclose(f);
	show("plus.txt");
	f = fopen("bin.dat", "wb");
	fwrite("\x01\x02\x00\x7f\xff", 1, 5, f);
	fclose(f);
	f = fopen("bin.dat", "rb");
	unsigned char b[8];
	size_t n = fread(b, 1, sizeof b, f);
	printf("rb read %zu: %02x %02x %02x %02x %02x\n", n, b[0], b[1], b[2], b[3], b[4]);
	fclose(f);
	f = fopen("bin.dat", "ab");
	fputc(0x42, f);
	fclose(f);
	f = fopen("bin.dat", "r+b");
	fseek(f, 0, SEEK_END);
	printf("size after ab: %ld\n", ftell(f));
	fclose(f);
	f = fopen("plus.txt", "w+b");
	fputs("replaced\n", f);
	fclose(f);
	show("plus.txt");
	return 0;
}
