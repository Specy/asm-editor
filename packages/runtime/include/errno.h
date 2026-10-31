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
#define ESRCH 3
#define EINTR 4
#define EIO 5
#define ENXIO 6
#define EBADF 9
#define EAGAIN 11
#define EWOULDBLOCK EAGAIN
#define ENOMEM 12
#define EACCES 13
#define EFAULT 14
#define EBUSY 16
#define EEXIST 17
#define ENODEV 19
#define ENOTDIR 20
#define EISDIR 21
#define EINVAL 22
#define EMFILE 24
#define ENOTTY 25
#define EFBIG 27
#define ENOSPC 28
#define ESPIPE 29
#define EPIPE 32
#define EDOM 33
#define ERANGE 34
#define ENOSYS 38
#define EOVERFLOW 75
#define EILSEQ 84
#define EOPNOTSUPP 95
#define ENOTSUP EOPNOTSUPP

#endif
