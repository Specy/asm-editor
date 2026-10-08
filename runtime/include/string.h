/* Runtime library, ABI v1: <string.h>. The "C" locale only: strcoll compares like strcmp. */
#ifndef _STRING_H
#define _STRING_H

#ifdef __cplusplus
extern "C" {
#endif

typedef __SIZE_TYPE__ size_t;

#ifndef NULL
#ifdef __cplusplus
#define NULL __null
#else
#define NULL ((void *)0)
#endif
#endif

/** Copies n bytes from src to dest, which must not overlap, and returns dest. */
void *memcpy(void *dest, const void *src, size_t n);
/** Copies n bytes from src to dest, which may overlap, and returns dest. */
void *memmove(void *dest, const void *src, size_t n);
/** Fills n bytes at dest with the byte c and returns dest. */
void *memset(void *dest, int c, size_t n);
/** Compares n bytes as unsigned chars; returns a negative, zero or positive value. */
int memcmp(const void *a, const void *b, size_t n);
/** Returns a pointer to the first byte equal to c in the first n bytes of s, or NULL. */
void *memchr(const void *s, int c, size_t n);

/** Returns the length of the string s, not counting its terminating NUL. */
size_t strlen(const char *s);
/** Returns the length of s, but at most n. */
size_t strnlen(const char *s, size_t n);
/** Copies the string src, including its NUL, to dest and returns dest. */
char *strcpy(char *dest, const char *src);
/** Copies at most n characters of src to dest, padding with NULs; dest is not terminated if src is n or longer. Returns dest. */
char *strncpy(char *dest, const char *src, size_t n);
/** Appends the string src to the end of dest and returns dest. */
char *strcat(char *dest, const char *src);
/** Appends at most n characters of src, then a NUL, to dest and returns dest. */
char *strncat(char *dest, const char *src, size_t n);
/** Compares two strings; returns a negative, zero or positive value. */
int strcmp(const char *a, const char *b);
/** Compares at most n characters of two strings; returns a negative, zero or positive value. */
int strncmp(const char *a, const char *b, size_t n);
/** Compares two strings in the "C" locale, exactly like strcmp. */
int strcoll(const char *a, const char *b);
/** Copies src into dest (at most n bytes) in the "C" locale and returns the length of src. */
size_t strxfrm(char *dest, const char *src, size_t n);
/** Returns a pointer to the first occurrence of the character c in s (c may be NUL), or NULL. */
char *strchr(const char *s, int c);
/** Returns a pointer to the last occurrence of the character c in s, or NULL. */
char *strrchr(const char *s, int c);
/** Returns a pointer to the first occurrence of the string needle in haystack, or NULL. */
char *strstr(const char *haystack, const char *needle);
/** Returns the length of the initial part of s made only of characters in accept. */
size_t strspn(const char *s, const char *accept);
/** Returns the length of the initial part of s containing no character from reject. */
size_t strcspn(const char *s, const char *reject);
/** Returns a pointer to the first character of s that is in accept, or NULL. */
char *strpbrk(const char *s, const char *accept);
/** Splits a string into tokens separated by characters in delim; pass the string first, then NULL to continue. */
char *strtok(char *str, const char *delim);
/** Returns a malloc'ed copy of the string s, or NULL if memory runs out. */
char *strdup(const char *s);
/** Returns a malloc'ed copy of at most n characters of s, always terminated, or NULL if memory runs out. */
char *strndup(const char *s, size_t n);
/** Returns a message describing the error number errnum. */
char *strerror(int errnum);

#ifdef __cplusplus
}
#endif

#endif
