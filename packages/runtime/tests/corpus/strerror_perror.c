/* strerror and perror for error numbers whose glibc and musl messages agree, and the errno constants. */
#include <stdio.h>
#include <string.h>
#include <errno.h>

int main(void)
{
	printf("ENOENT: %s\n", strerror(ENOENT));
	printf("EINVAL: %s\n", strerror(EINVAL));
	printf("EBADF: %s\n", strerror(EBADF));
	printf("EACCES: %s\n", strerror(EACCES));
	printf("EEXIST: %s\n", strerror(EEXIST));
	printf("values: EDOM=%d ERANGE=%d ENOENT=%d EINVAL=%d EBADF=%d ENOMEM=%d EIO=%d ENOSPC=%d EOVERFLOW=%d EILSEQ=%d\n",
		EDOM, ERANGE, ENOENT, EINVAL, EBADF, ENOMEM, EIO, ENOSPC, EOVERFLOW, EILSEQ);
	errno = ENOENT;
	perror("open");
	errno = EINVAL;
	perror("argument");
	errno = 0;
	FILE *f = fopen("no/such/file", "r");
	if (!f) perror("fopen");
	return 0;
}
