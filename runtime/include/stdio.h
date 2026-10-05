/* Runtime library, ABI v1: <stdio.h>.
   Every output call writes its bytes with a write syscall before it returns, so fflush and setvbuf succeed without changing anything.
   FILE is opaque: getc, putc, feof and the rest are real functions. */
#ifndef _STDIO_H
#define _STDIO_H

#ifdef __cplusplus
extern "C" {
#endif

typedef __SIZE_TYPE__ size_t;
typedef struct _IO_FILE FILE;
typedef struct { long long __aed_pos; } fpos_t;

#ifndef NULL
#ifdef __cplusplus
#define NULL __null
#else
#define NULL ((void *)0)
#endif
#endif

#define EOF (-1)
#define BUFSIZ 1024
#define FILENAME_MAX 4096
#define FOPEN_MAX 32
#define SEEK_SET 0
#define SEEK_CUR 1
#define SEEK_END 2
#define _IOFBF 0
#define _IOLBF 1
#define _IONBF 2

extern FILE *const stdin;
extern FILE *const stdout;
extern FILE *const stderr;
#define stdin (stdin)
#define stdout (stdout)
#define stderr (stderr)

#define __AED_PRINTF(f, a) __attribute__((__format__(__printf__, f, a)))
#define __AED_SCANF(f, a) __attribute__((__format__(__scanf__, f, a)))

/** Opens the file at path with mode "r", "w" or "a" (optionally with "+", "b" or "x") and returns its stream, or NULL with errno set. */
FILE *fopen(const char *path, const char *mode);
/** Closes stream and opens path in its place, as fopen would; commonly used to read stdin from a File. */
FILE *freopen(const char *path, const char *mode, FILE *stream);
/** Closes a stream opened by fopen and returns 0, or EOF on error. */
int fclose(FILE *stream);
/** Succeeds without doing anything: every stream already writes through. Returns 0. */
int fflush(FILE *stream);
/** Accepts a buffering request and ignores it, because every stream writes through; returns 0 for a valid mode. */
int setvbuf(FILE *stream, char *buf, int mode, size_t size);
/** Accepts a buffer for stream and ignores it, because every stream writes through. */
void setbuf(FILE *stream, char *buf);

/** Writes formatted output to stdout and returns the number of bytes written, or a negative value on error. */
int printf(const char *format, ...) __AED_PRINTF(1, 2);
/** Writes formatted output to stream and returns the number of bytes written, or a negative value on error. */
int fprintf(FILE *stream, const char *format, ...) __AED_PRINTF(2, 3);
/** Writes formatted output into str with a terminating NUL and returns the number of characters written. */
int sprintf(char *str, const char *format, ...) __AED_PRINTF(2, 3);
/** Writes at most n-1 formatted characters into str plus a NUL and returns the length the full output would have had. */
int snprintf(char *str, size_t n, const char *format, ...) __AED_PRINTF(3, 4);
/** Like printf, with the arguments taken from a va_list. */
int vprintf(const char *format, __builtin_va_list ap) __AED_PRINTF(1, 0);
/** Like fprintf, with the arguments taken from a va_list. */
int vfprintf(FILE *stream, const char *format, __builtin_va_list ap) __AED_PRINTF(2, 0);
/** Like sprintf, with the arguments taken from a va_list. */
int vsprintf(char *str, const char *format, __builtin_va_list ap) __AED_PRINTF(2, 0);
/** Like snprintf, with the arguments taken from a va_list. */
int vsnprintf(char *str, size_t n, const char *format, __builtin_va_list ap) __AED_PRINTF(3, 0);

/** Reads formatted input from stdin and returns the number of items assigned, or EOF if input ended before the first conversion. */
int scanf(const char *format, ...) __AED_SCANF(1, 2);
/** Reads formatted input from stream and returns the number of items assigned, or EOF if input ended before the first conversion. */
int fscanf(FILE *stream, const char *format, ...) __AED_SCANF(2, 3);
/** Reads formatted input from the string str and returns the number of items assigned. */
int sscanf(const char *str, const char *format, ...) __AED_SCANF(2, 3);
/** Like scanf, with the arguments taken from a va_list. */
int vscanf(const char *format, __builtin_va_list ap) __AED_SCANF(1, 0);
/** Like fscanf, with the arguments taken from a va_list. */
int vfscanf(FILE *stream, const char *format, __builtin_va_list ap) __AED_SCANF(2, 0);
/** Like sscanf, with the arguments taken from a va_list. */
int vsscanf(const char *str, const char *format, __builtin_va_list ap) __AED_SCANF(2, 0);

/** Reads the next character from stream as an unsigned char converted to int, or returns EOF. */
int fgetc(FILE *stream);
/** Reads the next character from stream, exactly like fgetc. */
int getc(FILE *stream);
/** Reads the next character from stdin, or returns EOF at the end of input. */
int getchar(void);
/** Reads a line of at most n-1 characters, keeping the newline, into str; returns str, or NULL if nothing was read. */
char *fgets(char *str, int n, FILE *stream);
/** Pushes the character c back onto stream so the next read returns it; returns c, or EOF on failure. */
int ungetc(int c, FILE *stream);
/** Writes the character c to stream and returns it, or EOF on error. */
int fputc(int c, FILE *stream);
/** Writes the character c to stream, exactly like fputc. */
int putc(int c, FILE *stream);
/** Writes the character c to stdout and returns it, or EOF on error. */
int putchar(int c);
/** Writes the string str to stream without a newline; returns a non-negative value, or EOF on error. */
int fputs(const char *str, FILE *stream);
/** Writes the string str and a newline to stdout; returns a non-negative value, or EOF on error. */
int puts(const char *str);
/** Reads up to count items of size bytes each into ptr and returns the number of complete items read. */
size_t fread(void *ptr, size_t size, size_t count, FILE *stream);
/** Writes count items of size bytes each from ptr and returns the number of complete items written. */
size_t fwrite(const void *ptr, size_t size, size_t count, FILE *stream);

/** Moves the position of stream to offset from SEEK_SET, SEEK_CUR or SEEK_END; returns 0, or -1 on error. */
int fseek(FILE *stream, long offset, int whence);
/** Returns the current position of stream, or -1 on error. */
long ftell(FILE *stream);
/** Moves stream back to its start and clears its error indicator. */
void rewind(FILE *stream);
/** Stores the current position of stream in *pos; returns 0, or -1 on error. */
int fgetpos(FILE *stream, fpos_t *pos);
/** Moves stream to a position saved by fgetpos; returns 0, or -1 on error. */
int fsetpos(FILE *stream, const fpos_t *pos);

/** Returns nonzero if the end-of-file indicator of stream is set. */
int feof(FILE *stream);
/** Returns nonzero if the error indicator of stream is set. */
int ferror(FILE *stream);
/** Clears the end-of-file and error indicators of stream. */
void clearerr(FILE *stream);
/** Writes msg, a colon and the message for the current errno to stderr. */
void perror(const char *msg);

#ifdef __cplusplus
}
#endif

#endif
