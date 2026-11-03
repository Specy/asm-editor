/* Runtime library, ABI v1, MIPS and RISC-V: <sys/types.h>, the types of the POSIX file and folder calls. Their sizes
   are musl's: off_t and ino_t are 64-bit on every Target. */
#ifndef _SYS_TYPES_H
#define _SYS_TYPES_H

#if !defined(__mips__) && !defined(__riscv)
#error "This <sys/types.h> is the MIPS and RISC-V one, included in a compilation for another Target"
#endif

typedef __SIZE_TYPE__ size_t;
typedef long ssize_t;
typedef long long off_t;
typedef unsigned long long ino_t;
typedef unsigned long long dev_t;
typedef unsigned int mode_t;
typedef unsigned int nlink_t;
typedef unsigned int uid_t;
typedef unsigned int gid_t;
typedef long blksize_t;
typedef long long blkcnt_t;

#endif
