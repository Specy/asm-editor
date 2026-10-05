/* Derived from musl 1.2.6 src/stdio/vsscanf.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: includes <stdarg.h> for va_list (this library's <stdio.h> does not define it); no lock field; the __isoc99 alias is removed. */
#include "stdio_impl.h"
#include <string.h>
#include <stdarg.h>

static size_t string_read(FILE *f, unsigned char *buf, size_t len)
{
	char *src = f->cookie;
	size_t k = len+256;
	char *end = memchr(src, 0, k);
	if (end) k = end-src;
	if (k < len) len = k;
	memcpy(buf, src, len);
	f->rpos = (void *)(src+len);
	f->rend = (void *)(src+k);
	f->cookie = src+k;
	return len;
}

int vsscanf(const char *restrict s, const char *restrict fmt, va_list ap)
{
	FILE f = {
		.buf = (void *)s, .cookie = (void *)s,
		.read = string_read
	};
	return vfscanf(&f, fmt, ap);
}
