/* setvbuf, setbuf and fflush succeed (the library writes through, so they change no output). */
#include <stdio.h>

static char buffer[256];

int main(void)
{
	printf("setvbuf full=%d\n", setvbuf(stdout, buffer, _IOFBF, sizeof buffer));
	printf("written after setvbuf\n");
	printf("fflush(stdout)=%d\n", fflush(stdout));
	printf("fflush(NULL)=%d\n", fflush(NULL));
	setbuf(stderr, NULL);
	fprintf(stderr, "stderr after setbuf\n");
	printf("fflush(stderr)=%d\n", fflush(stderr));
	FILE *f = fopen("buffered.txt", "w");
	printf("setvbuf line=%d\n", setvbuf(f, NULL, _IOLBF, 0));
	fputs("partial", f);
	printf("fflush(file)=%d\n", fflush(f));
	fputs(" line\n", f);
	fclose(f);
	f = fopen("unbuffered.txt", "w");
	printf("setvbuf none=%d\n", setvbuf(f, NULL, _IONBF, 0));
	fputs("unbuffered\n", f);
	fclose(f);
	f = fopen("unbuffered.txt", "r");
	printf("setvbuf bad mode=%d\n", setvbuf(f, NULL, 42, 0) != 0);
	fclose(f);
	return 0;
}
