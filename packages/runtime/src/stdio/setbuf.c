/* Derived from musl 1.2.6 src/stdio/setbuf.c (MIT, see runtime/third_party/musl/COPYRIGHT). Unchanged apart from this comment. */
#include <stdio.h>

void setbuf(FILE *restrict f, char *restrict buf)
{
	setvbuf(f, buf, buf ? _IOFBF : _IONBF, BUFSIZ);
}
