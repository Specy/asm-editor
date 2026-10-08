/* Copying, comparing and measuring: memcpy, memmove (both overlap directions), memset, memcmp, memchr, strlen,
 * strnlen, strcpy, strncpy (padding, no terminator), strcat, strncat, strcmp, strncmp, strcoll, strxfrm,
 * strdup and strndup. Comparisons print only their sign, which is all C specifies. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* The truncating strncpy and strncat calls are deliberate. */
#pragma GCC diagnostic ignored "-Wstringop-truncation"

static int sign(int r) { return (r > 0) - (r < 0); }

static void show(const char *label, const char *buf, size_t n)
{
	printf("%s: [", label);
	for (size_t i = 0; i < n; i++) putchar(buf[i] ? buf[i] : '.');
	printf("]\n");
}

int main(void)
{
	char buf[32];
	memset(buf, '-', sizeof buf);
	printf("memcpy returns dest=%d\n", memcpy(buf, "hello", 5) == buf);
	show("memcpy", buf, 12);
	strcpy(buf, "0123456789");
	memmove(buf + 2, buf, 6);
	show("memmove right", buf, 11);
	strcpy(buf, "0123456789");
	memmove(buf, buf + 3, 7);
	show("memmove left", buf, 11);
	printf("memset returns dest=%d\n", memset(buf, 'z', 4) == buf);
	memset(buf + 4, 0, 3);
	show("memset", buf, 10);
	printf("memcmp: %d %d %d %d\n", sign(memcmp("abc", "abd", 3)), sign(memcmp("abc", "abc", 3)),
		sign(memcmp("b", "a", 1)), sign(memcmp("\x80", "\x01", 1)));
	printf("memcmp n=0: %d\n", memcmp("a", "b", 0));
	const char *text = "find the x here";
	printf("memchr: %d %d %d\n", (int)((const char *)memchr(text, 'x', 15) - text), memchr(text, 'q', 15) == NULL,
		memchr(text, 'h', 3) == NULL);
	printf("memchr NUL: %d\n", (int)((const char *)memchr(text, 0, 16) - text));
	printf("strlen: %zu %zu %zu\n", strlen(""), strlen("a"), strlen("hello world"));
	printf("strnlen: %zu %zu %zu\n", strnlen("hello", 3), strnlen("hi", 10), strnlen("", 5));
	printf("strcpy returns dest=%d [%s]\n", strcpy(buf, "copied") == buf, buf);
	memset(buf, '#', sizeof buf);
	strncpy(buf, "ab", 6);
	show("strncpy pads", buf, 8);
	memset(buf, '#', sizeof buf);
	strncpy(buf, "abcdefgh", 4);
	show("strncpy no NUL", buf, 6);
	strcpy(buf, "con");
	printf("strcat returns dest=%d ", strcat(buf, "cat") == buf);
	strcat(buf, "enated");
	printf("[%s]\n", buf);
	strcpy(buf, "abc");
	strncat(buf, "defghij", 3);
	printf("strncat: [%s]\n", buf);
	strncat(buf, "XY", 10);
	printf("strncat short: [%s]\n", buf);
	printf("strcmp: %d %d %d %d %d\n", sign(strcmp("apple", "apricot")), sign(strcmp("same", "same")),
		sign(strcmp("abc", "ab")), sign(strcmp("", "a")), sign(strcmp("\xff", "a")));
	printf("strncmp: %d %d %d %d\n", sign(strncmp("abcdef", "abcxyz", 3)), sign(strncmp("abcdef", "abcxyz", 4)),
		sign(strncmp("ab", "abc", 5)), strncmp("x", "y", 0));
	printf("strcoll: %d %d\n", sign(strcoll("abc", "abd")), sign(strcoll("b", "b")));
	char x[16];
	size_t len = strxfrm(x, "xfrm", sizeof x);
	printf("strxfrm: %zu [%s] needed=%zu\n", len, x, strxfrm(NULL, "longer string", 0));
	char *d = strdup("duplicate me");
	printf("strdup: [%s] distinct=%d\n", d, d != NULL);
	free(d);
	char *nd = strndup("truncate", 5);
	printf("strndup: [%s]\n", nd);
	free(nd);
	nd = strndup("hi", 10);
	printf("strndup short: [%s]\n", nd);
	free(nd);
	return 0;
}
