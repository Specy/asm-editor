/* fseek with SEEK_SET, SEEK_CUR and SEEK_END, ftell, rewind, fgetpos and fsetpos, and ungetc's effect on ftell.
 * Every call with a side effect is its own statement: argument evaluation order is unspecified in C. */
#include <stdio.h>

int main(void)
{
	FILE *f = fopen("alphabet.txt", "w");
	for (int c = 'a'; c <= 'z'; c++) fputc(c, f);
	fputc('\n', f);
	printf("written, ftell=%ld\n", ftell(f));
	int r = fseek(f, 5, SEEK_SET);
	printf("fseek in writing stream=%d ftell=%ld\n", r, ftell(f));
	fputc('F', f);
	fclose(f);

	f = fopen("alphabet.txt", "r");
	printf("start ftell=%ld\n", ftell(f));
	r = fseek(f, 10, SEEK_SET);
	int c = fgetc(f);
	printf("fseek SET 10=%d char=%c ftell=%ld\n", r, c, ftell(f));
	r = fseek(f, 3, SEEK_CUR);
	c = fgetc(f);
	printf("fseek CUR 3=%d char=%c ftell=%ld\n", r, c, ftell(f));
	r = fseek(f, -5, SEEK_CUR);
	c = fgetc(f);
	printf("fseek CUR -5=%d char=%c\n", r, c);
	r = fseek(f, -3, SEEK_END);
	c = fgetc(f);
	printf("fseek END -3=%d char=%c ftell=%ld\n", r, c, ftell(f));
	r = fseek(f, 0, SEEK_END);
	c = fgetc(f);
	printf("fseek END 0=%d fgetc=%d feof=%d\n", r, c, feof(f) != 0);
	r = fseek(f, 0, SEEK_SET);
	printf("fseek clears EOF=%d feof=%d\n", r, feof(f) != 0);
	printf("fseek bad whence=%d\n", fseek(f, 0, 42));
	fpos_t pos;
	fgetc(f);
	fgetc(f);
	printf("fgetpos=%d\n", fgetpos(f, &pos));
	char a = fgetc(f);
	char b = fgetc(f);
	r = fsetpos(f, &pos);
	c = fgetc(f);
	printf("read %c%c then fsetpos=%d char=%c\n", a, b, r, c);
	rewind(f);
	c = fgetc(f);
	printf("rewind char=%c ftell=%ld\n", c, ftell(f));
	ungetc(c, f);
	long t = ftell(f);
	c = fgetc(f);
	printf("ungetc ftell=%ld fgetc=%c ftell=%ld\n", t, c, ftell(f));
	fclose(f);
	return 0;
}
