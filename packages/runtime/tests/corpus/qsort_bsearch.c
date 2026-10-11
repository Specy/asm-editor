/* qsort on ints, strings and structs (distinct keys, since qsort is not stable), sorted, reversed, tiny and
 * large inputs, and bsearch hits and misses. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int cmp_int(const void *a, const void *b)
{
	int x = *(const int *)a, y = *(const int *)b;
	return (x > y) - (x < y);
}

static int cmp_desc(const void *a, const void *b)
{
	return cmp_int(b, a);
}

static int cmp_str(const void *a, const void *b)
{
	return strcmp(*(const char *const *)a, *(const char *const *)b);
}

struct person { const char *name; int age; };

static int cmp_age(const void *a, const void *b)
{
	return ((const struct person *)a)->age - ((const struct person *)b)->age;
}

static void print_ints(const char *label, const int *v, int n)
{
	printf("%s:", label);
	for (int i = 0; i < n; i++) printf(" %d", v[i]);
	printf("\n");
}

int main(void)
{
	int v[] = { 42, -7, 0, 19, 3, 100, -50, 8, 77, 1 };
	int n = sizeof v / sizeof *v;
	qsort(v, n, sizeof *v, cmp_int);
	print_ints("ascending", v, n);
	qsort(v, n, sizeof *v, cmp_desc);
	print_ints("descending", v, n);
	qsort(v, n, sizeof *v, cmp_desc);
	print_ints("already sorted", v, n);
	qsort(v, 0, sizeof *v, cmp_int);
	qsort(v, 1, sizeof *v, cmp_int);
	print_ints("after empty and single", v, n);

	const char *words[] = { "pear", "apple", "fig", "banana", "cherry", "date", "elderberry", "grape" };
	int w = sizeof words / sizeof *words;
	qsort(words, w, sizeof *words, cmp_str);
	printf("strings:");
	for (int i = 0; i < w; i++) printf(" %s", words[i]);
	printf("\n");

	struct person people[] = { { "Ada", 36 }, { "Alan", 41 }, { "Grace", 85 }, { "Linus", 21 }, { "Barbara", 64 } };
	qsort(people, 5, sizeof *people, cmp_age);
	for (int i = 0; i < 5; i++) printf("%s(%d) ", people[i].name, people[i].age);
	printf("\n");

	enum { BIG = 2000 };
	int *big = malloc(BIG * sizeof *big);
	for (int i = 0; i < BIG; i++) big[i] = i;
	unsigned s = 7;
	for (int i = BIG - 1; i > 0; i--) {
		s = s * 1664525u + 1013904223u;
		int j = (int)(s % (unsigned)(i + 1)), t = big[i];
		big[i] = big[j];
		big[j] = t;
	}
	qsort(big, BIG, sizeof *big, cmp_int);
	int ok = 1;
	for (int i = 0; i < BIG; i++) ok &= big[i] == i;
	printf("large sorted=%d\n", ok);

	int keys[] = { 0, 1999, 1000, 2000, -1, 777 };
	for (int i = 0; i < 6; i++) {
		int *hit = bsearch(&keys[i], big, BIG, sizeof *big, cmp_int);
		printf("bsearch %d: %s\n", keys[i], hit ? "found" : "missing");
		if (hit) printf("  at index %d\n", (int)(hit - big));
	}
	const char *key = "fig";
	const char **found = bsearch(&key, words, w, sizeof *words, cmp_str);
	printf("bsearch string: %s\n", found ? *found : "missing");
	printf("bsearch empty: %s\n", bsearch(&key, words, 0, sizeof *words, cmp_str) ? "found" : "missing");
	free(big);
	return 0;
}
