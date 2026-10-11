/* File errors: a missing File (NULL, errno ENOENT, perror), an invalid mode, reading a write-only stream,
 * writing a read-only stream, error and end-of-file indicators with clearerr, and exclusive creation "x".
 * (No missing-folder case: the editor's FileSystem has implicit folders, so creating a/b.txt succeeds there.) */
#include <stdio.h>
#include <errno.h>
#include <string.h>

int main(void)
{
	errno = 0;
	FILE *f = fopen("does-not-exist.txt", "r");
	printf("missing: %s errno==ENOENT %d\n", f ? "opened" : "NULL", errno == ENOENT);
	perror("does-not-exist.txt");
	perror(NULL);
	perror("");
	errno = 0;
	f = fopen("x.txt", "z");
	printf("bad mode: %s errno==EINVAL %d\n", f ? "opened" : "NULL", errno == EINVAL);

	f = fopen("w.txt", "w");
	errno = 0;
	int c = fgetc(f);
	int e = errno;
	printf("fgetc on write-only: %d ferror=%d errno==EBADF %d\n", c, ferror(f) != 0, e == EBADF);
	clearerr(f);
	printf("after clearerr ferror=%d\n", ferror(f) != 0);
	char buf[8];
	size_t got = fread(buf, 1, 4, f);
	printf("fread on write-only: %zu ferror=%d\n", got, ferror(f) != 0);
	clearerr(f);
	printf("still writable: %d\n", fputs("data\n", f) >= 0);
	printf("fclose=%d\n", fclose(f));

	f = fopen("w.txt", "r");
	errno = 0;
	c = fputc('x', f);
	e = errno;
	printf("fputc on read-only: %d ferror=%d errno==EBADF %d\n", c, ferror(f) != 0, e == EBADF);
	printf("fprintf on read-only: %d\n", fprintf(f, "nope %d", 1) < 0);
	printf("fwrite on read-only: %zu\n", fwrite("abc", 1, 3, f));
	clearerr(f);
	printf("still readable: %s", fgets(buf, sizeof buf, f));
	fclose(f);

	errno = 0;
	f = fopen("w.txt", "wx");
	printf("wx on existing: %s errno==EEXIST %d\n", f ? "opened" : "NULL", errno == EEXIST);
	f = fopen("fresh.txt", "wx");
	printf("wx on new: %s\n", f ? "opened" : "NULL");
	if (f) {
		fputs("exclusive\n", f);
		fclose(f);
	}
	return 0;
}
