/* Write-through output: text without a newline, then _Exit, which flushes nothing. The library has already
 * written the text; glibc, buffering stdout in a pipe, loses it. This is the deliberate difference recorded in
 * writethrough.expect.stdout (see "Stream buffering" in docs/design/source-runtime.md). */
#include <stdio.h>
#include <stdlib.h>

int main(void)
{
	printf("partial line without newline");
	putchar('|');
	fputs("more", stdout);
	_Exit(0);
}
