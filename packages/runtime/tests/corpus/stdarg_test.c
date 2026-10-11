/* <stdarg.h>: a variadic sum over int, double and long long arguments, va_copy, and va_list forwarding to
 * vprintf, vfprintf, vsnprintf, vsscanf, vscanf and vfscanf. */
#include <stdio.h>
#include <stdarg.h>
#include <string.h>

static double sum(const char *types, ...)
{
	va_list ap, copy;
	double total = 0;
	va_start(ap, types);
	va_copy(copy, ap);
	for (const char *t = types; *t; t++) {
		if (*t == 'i') total += va_arg(ap, int);
		else if (*t == 'd') total += va_arg(ap, double);
		else if (*t == 'l') total += (double)va_arg(ap, long long);
	}
	va_end(ap);
	double first = *types == 'i' ? va_arg(copy, int) : *types == 'd' ? va_arg(copy, double) : (double)va_arg(copy, long long);
	va_end(copy);
	printf("first argument again via va_copy: %g\n", first);
	return total;
}

static int log_line(FILE *f, const char *fmt, ...)
{
	va_list ap;
	va_start(ap, fmt);
	int r = vfprintf(f, fmt, ap);
	va_end(ap);
	return r;
}

static int say(const char *fmt, ...)
{
	va_list ap;
	va_start(ap, fmt);
	int r = vprintf(fmt, ap);
	va_end(ap);
	return r;
}

static int parse(const char *s, const char *fmt, ...)
{
	va_list ap;
	va_start(ap, fmt);
	int r = vsscanf(s, fmt, ap);
	va_end(ap);
	return r;
}

static int read_stdin(const char *fmt, ...)
{
	va_list ap;
	va_start(ap, fmt);
	int r = vscanf(fmt, ap);
	va_end(ap);
	return r;
}

static int read_file(FILE *f, const char *fmt, ...)
{
	va_list ap;
	va_start(ap, fmt);
	int r = vfscanf(f, fmt, ap);
	va_end(ap);
	return r;
}

int main(void)
{
	printf("sum=%g\n", sum("idild", 1, 2.5, 3, 4000000000LL, 0.25));
	printf("sum=%g\n", sum("dddddddddd", 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0));
	printf("sum=%g\n", sum("iiiiiiiiiiii", 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12));
	int r = say("say %s %d %.2f %c\n", "hi", 42, 2.5, '!');
	printf("say returned %d\n", r);
	r = log_line(stderr, "log %d\n", 7);
	printf("log returned %d\n", r);
	int a, b;
	r = parse("12 34", "%d %d", &a, &b);
	printf("parse %d: %d %d\n", r, a, b);
	char word[16];
	r = read_stdin("%15s %d", word, &a);
	printf("vscanf %d: %s %d\n", r, word, a);
	FILE *f = fopen("values.txt", "w");
	fputs("3.5 seven\n", f);
	fclose(f);
	f = fopen("values.txt", "r");
	double d;
	r = read_file(f, "%lf %15s", &d, word);
	printf("vfscanf %d: %g %s\n", r, d, word);
	fclose(f);
	return 0;
}
