/* Runtime library, ABI v1: <ctype.h>. The "C" locale only: characters above 127 belong to no class. */
#ifndef _CTYPE_H
#define _CTYPE_H

#ifdef __cplusplus
extern "C" {
#endif

/** Returns nonzero if c is a letter or a digit. */
int isalnum(int c);
/** Returns nonzero if c is a letter. */
int isalpha(int c);
/** Returns nonzero if c is a space or a tab. */
int isblank(int c);
/** Returns nonzero if c is a control character. */
int iscntrl(int c);
/** Returns nonzero if c is a decimal digit. */
int isdigit(int c);
/** Returns nonzero if c is printable and not a space. */
int isgraph(int c);
/** Returns nonzero if c is a lowercase letter. */
int islower(int c);
/** Returns nonzero if c is printable, including the space. */
int isprint(int c);
/** Returns nonzero if c is printable but neither a space nor alphanumeric. */
int ispunct(int c);
/** Returns nonzero if c is white space: space, \t, \n, \v, \f or \r. */
int isspace(int c);
/** Returns nonzero if c is an uppercase letter. */
int isupper(int c);
/** Returns nonzero if c is a hexadecimal digit. */
int isxdigit(int c);
/** Returns the lowercase form of c if it is an uppercase letter, otherwise c. */
int tolower(int c);
/** Returns the uppercase form of c if it is a lowercase letter, otherwise c. */
int toupper(int c);

#ifdef __cplusplus
}
#endif

#endif
