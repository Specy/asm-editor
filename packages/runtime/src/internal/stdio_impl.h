/* Derived from musl 1.2.6 src/internal/stdio_impl.h (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: FILE trimmed to the fields this library uses (no locks, pipes, locale, getline buffer or open-file
 * list); off_t is long; FLOCK/FUNLOCK are no-ops; system access goes through aed_sys.h; NL_ARGMAX defined here.
 * Every FILE has buf_size 0 with UNGET bytes before buf, so output writes through and ungetc still works. */
#ifndef _STDIO_IMPL_H
#define _STDIO_IMPL_H

#include <stdio.h>
#include "features.h"
#include "aed_sys.h"

typedef long off_t;
typedef long ssize_t;

#define UNGET 8
#define NL_ARGMAX 9

#define FLOCK(f) ((void)0)
#define FUNLOCK(f) ((void)0)

#define F_PERM 1
#define F_NORD 4
#define F_NOWR 8
#define F_EOF 16
#define F_ERR 32
#define F_SVB 64
#define F_APP 128

struct _IO_FILE {
	unsigned flags;
	FILE *next_open;
	unsigned char *owned_buffer;
	unsigned char *input_buffer;
	unsigned char *rpos, *rend;
	int (*close)(FILE *);
	unsigned char *wend, *wpos;
	unsigned char *wbase;
	size_t (*read)(FILE *, unsigned char *, size_t);
	size_t (*write)(FILE *, const unsigned char *, size_t);
	off_t (*seek)(FILE *, off_t, int);
	unsigned char *buf;
	size_t buf_size;
	int fd;
	int mode;
	int lbf;
	void *cookie;
	unsigned char *shend;
	off_t shlim, shcnt;
};

extern hidden FILE *__aed_open_streams;

hidden size_t __stdio_read(FILE *, unsigned char *, size_t);
hidden size_t __stdio_write(FILE *, const unsigned char *, size_t);
hidden off_t __stdio_seek(FILE *, off_t, int);
hidden int __stdio_close(FILE *);

hidden int __toread(FILE *);
hidden int __towrite(FILE *);

int __overflow(FILE *, int), __uflow(FILE *);

hidden int __fseeko(FILE *, off_t, int);
hidden int __fseeko_unlocked(FILE *, off_t, int);
hidden off_t __ftello(FILE *);
hidden off_t __ftello_unlocked(FILE *);
hidden size_t __fwritex(const unsigned char *, size_t, FILE *);

hidden int __fmodeflags(const char *);

#define feof(f) ((f)->flags & F_EOF)
#define ferror(f) ((f)->flags & F_ERR)

#define getc_unlocked(f) \
	( ((f)->rpos != (f)->rend) ? *(f)->rpos++ : __uflow((f)) )

#define putc_unlocked(c, f) \
	( (((unsigned char)(c)!=(f)->lbf && (f)->wpos!=(f)->wend)) \
	? *(f)->wpos++ = (unsigned char)(c) \
	: __overflow((f),(unsigned char)(c)) )

#endif
