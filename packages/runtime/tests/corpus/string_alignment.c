/* musl's string functions work a word at a time once a pointer is aligned. This compares them with simple
 * byte loops for every source and destination alignment modulo 8 (covering 4- and 8-byte words) and every
 * length up to 40 (past the 16-byte unrolled loops), and prints only the totals. Sized to stay near ten
 * million instructions on a Core. */
/* core-instruction-limit: 50000000 (measured about 19M instructions at -O0 on RV32, RARS) */
#include <stdio.h>
#include <string.h>

/* The truncating strncpy calls are deliberate. */
#pragma GCC diagnostic ignored "-Wstringop-truncation"

enum { SIZE = 64 };
static unsigned char src[SIZE], dst[SIZE], ref[SIZE];

static void fill(unsigned char *p, int n, int seed)
{
	for (int i = 0; i < n; i++) p[i] = (unsigned char)(seed + i * 7 + (i >> 3));
}

int main(void)
{
	long checks = 0, bad = 0;
	for (int so = 0; so < 8; so++) {
		fill(src, SIZE, so * 3);
		for (int d0 = 0; d0 < 8; d0++)
			for (int n = 0; n <= 40; n++) {
				/* memcpy between different buffers */
				memset(dst, 0xee, SIZE);
				memset(ref, 0xee, SIZE);
				memcpy(dst + d0, src + so, n);
				for (int i = 0; i < n; i++) ref[d0 + i] = src[so + i];
				checks++;
				bad += memcmp(dst, ref, SIZE) != 0;
				/* memmove inside one buffer, both directions */
				fill(dst, SIZE, n);
				fill(ref, SIZE, n);
				memmove(dst + d0, dst + so, n);
				if (d0 > so)
					for (int i = n - 1; i >= 0; i--) ref[d0 + i] = ref[so + i];
				else
					for (int i = 0; i < n; i++) ref[d0 + i] = ref[so + i];
				checks++;
				bad += memcmp(dst, ref, SIZE) != 0;
				/* memset */
				memset(dst + d0, so, n);
				for (int i = 0; i < n; i++) ref[d0 + i] = (unsigned char)so;
				checks++;
				bad += memcmp(dst, ref, SIZE) != 0;
			}
	}
	for (int off = 0; off < 8; off++)
		for (int len = 0; len < 48; len++) {
			char s[80];
			memset(s, 'a', sizeof s);
			for (int i = 0; i < len; i++) s[off + i] = (char)('b' + (i % 20));
			s[off + len] = 0;
			checks++;
			bad += strlen(s + off) != (size_t)len;
			checks++;
			bad += strnlen(s + off, 20) != (size_t)(len < 20 ? len : 20);
			for (int at = 0; at < len; at += 5) {
				char c = s[off + at];
				const char *expect = s + off;
				while (*expect != c) expect++;
				checks++;
				bad += strchr(s + off, c) != expect;
				checks++;
				bad += memchr(s + off, c, len) != expect;
			}
			checks++;
			bad += strchr(s + off, 'z') != NULL;
			checks++;
			bad += strchr(s + off, 0) != s + off + len;
			char copy[80];
			memset(copy, 'q', sizeof copy);
			strcpy(copy + (off ^ 5), s + off);
			checks++;
			bad += strcmp(copy + (off ^ 5), s + off) != 0 || copy[(off ^ 5) + len] != 0;
			memset(copy, 'q', sizeof copy);
			strncpy(copy + (off ^ 3), s + off, len + 4);
			checks++;
			bad += memcmp(copy + (off ^ 3), s + off, len) != 0 || copy[(off ^ 3) + len + 3] != 0;
			if (len) {
				strcpy(copy, s + off);
				copy[len - 1]++;
				checks++;
				bad += !(strcmp(s + off, copy) < 0 && strcmp(copy, s + off) > 0);
				checks++;
				bad += !(memcmp(s + off, copy, len) < 0);
			}
		}
	printf("checks=%ld mismatches=%ld\n", checks, bad);
	return 0;
}
