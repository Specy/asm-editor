/* Runtime library, ABI v1: <errno.h>. errno is a plain global variable because programs have a single thread. */
#ifndef _ERRNO_H
#define _ERRNO_H

#ifdef __cplusplus
extern "C" {
#endif

extern int errno;

#ifdef __cplusplus
}
#endif

#define EPERM 1
#define ENOENT 2
#define EIO 5
#define EBADF 9
#define EAGAIN 11
#define ENOMEM 12
#define EACCES 13
#define EEXIST 17
#define EINVAL 22
#define EMFILE 24
#define ENOSPC 28
#define ESPIPE 29
#define EDOM 33
#define ERANGE 34
#define ENOSYS 38
#define EOVERFLOW 75
#define EILSEQ 84

#endif
