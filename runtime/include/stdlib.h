/* Runtime library, ABI v1: <stdlib.h>. malloc sets up its heap with sbrk on first use; nothing needs startup code. */
#ifndef _STDLIB_H
#define _STDLIB_H

#ifdef __cplusplus
extern "C" {
#endif

typedef __SIZE_TYPE__ size_t;
typedef struct { int quot; int rem; } div_t;
typedef struct { long quot; long rem; } ldiv_t;
typedef struct { long long quot; long long rem; } lldiv_t;

#ifndef NULL
#ifdef __cplusplus
#define NULL __null
#else
#define NULL ((void *)0)
#endif
#endif

#define EXIT_SUCCESS 0
#define EXIT_FAILURE 1
#define RAND_MAX 0x7fffffff
#define MB_CUR_MAX 1

/** Allocates size bytes of uninitialized memory and returns a pointer to it, or NULL with errno set to ENOMEM. */
void *malloc(size_t size);
/** Allocates zeroed memory for count objects of size bytes each, or returns NULL if the total overflows or memory runs out. */
void *calloc(size_t count, size_t size);
/** Resizes the block at ptr to size bytes, moving it if needed; returns the new pointer, or NULL leaving the block unchanged. */
void *realloc(void *ptr, size_t size);
/** Allocates size bytes aligned to alignment (a power of two) and returns a pointer, or NULL. */
void *aligned_alloc(size_t alignment, size_t size);
/** Releases a block returned by malloc, calloc, realloc or aligned_alloc; free(NULL) does nothing. */
void free(void *ptr);

/** Converts the start of a string to int (decimal, no error detection). */
int atoi(const char *str);
/** Converts the start of a string to long (decimal, no error detection). */
long atol(const char *str);
/** Converts the start of a string to long long (decimal, no error detection). */
long long atoll(const char *str);
/** Converts the start of a string to double (no error detection). */
double atof(const char *str);
/** Converts the start of a string to long in the given base (0 detects 0x and 0 prefixes), storing the end in *end; sets errno to ERANGE on overflow. */
long strtol(const char *str, char **end, int base);
/** Converts the start of a string to unsigned long in the given base, storing the end in *end; sets errno to ERANGE on overflow. */
unsigned long strtoul(const char *str, char **end, int base);
/** Converts the start of a string to long long in the given base, storing the end in *end; sets errno to ERANGE on overflow. */
long long strtoll(const char *str, char **end, int base);
/** Converts the start of a string to unsigned long long in the given base, storing the end in *end; sets errno to ERANGE on overflow. */
unsigned long long strtoull(const char *str, char **end, int base);
/** Converts the start of a string to double, correctly rounded, storing the end in *end; sets errno to ERANGE on overflow or underflow. */
double strtod(const char *str, char **end);
/** Converts the start of a string to float, correctly rounded, storing the end in *end; sets errno to ERANGE on overflow or underflow. */
float strtof(const char *str, char **end);

/** Returns the absolute value of an int. */
int abs(int n);
/** Returns the absolute value of a long. */
long labs(long n);
/** Returns the absolute value of a long long. */
long long llabs(long long n);
/** Divides two ints, returning the quotient and remainder together. */
div_t div(int num, int den);
/** Divides two longs, returning the quotient and remainder together. */
ldiv_t ldiv(long num, long den);
/** Divides two long longs, returning the quotient and remainder together. */
lldiv_t lldiv(long long num, long long den);

/** Sorts count elements of size bytes at base in place using the comparison function cmp. */
void qsort(void *base, size_t count, size_t size, int (*cmp)(const void *, const void *));
/** Searches a sorted array for key with the comparison function cmp; returns the matching element or NULL. */
void *bsearch(const void *key, const void *base, size_t count, size_t size, int (*cmp)(const void *, const void *));
/** Returns a pseudo-random integer between 0 and RAND_MAX. */
int rand(void);
/** Seeds the sequence returned by rand; the same seed repeats the same sequence. */
void srand(unsigned int seed);

/** Runs atexit handlers and static destructors, then ends the program with the given status. */
__attribute__((__noreturn__)) void exit(int status);
/** Ends the program immediately with the given status, without running atexit handlers. */
__attribute__((__noreturn__)) void _Exit(int status);
/** Ends the program abnormally with status 134, without running atexit handlers. */
__attribute__((__noreturn__)) void abort(void);
/** Registers a function for exit to call, in reverse order of registration; returns 0 on success. */
int atexit(void (*func)(void));
/** Always returns NULL: programs have no environment. */
char *getenv(const char *name);

#ifdef __cplusplus
}

extern "C++" {
/** Returns the absolute value of a long (C++ overload). */
inline long abs(long n) { return n < 0 ? -n : n; }
/** Returns the absolute value of a long long (C++ overload). */
inline long long abs(long long n) { return n < 0 ? -n : n; }
/** Returns the absolute value of a double (C++ overload). */
inline double abs(double x) { return __builtin_fabs(x); }
/** Returns the absolute value of a float (C++ overload). */
inline float abs(float x) { return __builtin_fabsf(x); }
/** Divides two longs, returning the quotient and remainder together (C++ overload). */
inline ldiv_t div(long num, long den) { return ldiv(num, den); }
/** Divides two long longs, returning the quotient and remainder together (C++ overload). */
inline lldiv_t div(long long num, long long den) { return lldiv(num, den); }
}
#endif

#endif
