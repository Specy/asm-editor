/* Character and string output: puts, putchar, putc, fputc, fputs and fwrite on stdout and stderr, with their
 * return values, interleaved with printf. */
#include <stdio.h>

int main(void)
{
	int r;
	r = puts("puts line");
	printf("puts returned %d\n", r >= 0);
	r = putchar('A');
	r += putchar('\n');
	printf("putchar returned %d\n", r);
	r = putc('B', stdout);
	putc('\n', stdout);
	printf("putc returned %d\n", r);
	r = fputc('C', stdout);
	fputc('\n', stdout);
	printf("fputc returned %d\n", r);
	r = fputc(0x1c1, stdout);
	fputc('\n', stdout);
	printf("fputc wide returned %d\n", r);
	r = fputs("fputs no newline", stdout);
	printf("| fputs returned %d\n", r >= 0);
	r = fputs("", stdout);
	printf("fputs empty returned %d\n", r >= 0);
	size_t w = fwrite("fwrite data\n", 1, 12, stdout);
	printf("fwrite returned %zu\n", w);
	w = fwrite("abcdefgh", 4, 2, stdout);
	printf("\nfwrite items %zu\n", w);
	w = fwrite("ignored", 0, 5, stdout);
	printf("fwrite size 0 returned %zu\n", w);
	w = fwrite("ignored", 5, 0, stdout);
	printf("fwrite count 0 returned %zu\n", w);
	fputs("stderr line 1\n", stderr);
	fputc('x', stderr);
	putc('y', stderr);
	fwrite("z\n", 1, 2, stderr);
	puts("");
	puts("after empty puts");
	for (int c = 32; c < 127; c++) putchar(c);
	putchar('\n');
	return 0;
}
