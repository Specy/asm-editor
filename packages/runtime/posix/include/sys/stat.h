/* Runtime library, ABI v1, MIPS and RISC-V: <sys/stat.h>. stat, which describes what is at a path, mkdir, which makes
   a folder, and the macros that read st_mode. struct stat is laid out as Linux lays out the structure its stat call
   fills: struct stat64 on MIPS and RV32, each in its own arrangement, and struct stat on RV64. Only st_mode, st_size,
   st_ino and st_nlink carry anything; the times, the owners and the rest read 0. */
#ifndef _SYS_STAT_H
#define _SYS_STAT_H

#if !defined(__mips__) && !defined(__riscv)
#error "This <sys/stat.h> is the MIPS and RISC-V one, included in a compilation for another Target"
#endif

#include <sys/types.h>

#ifdef __cplusplus
extern "C" {
#endif

#if defined(__mips__)
/* Linux's struct stat64 for MIPS o32 (arch/mips/include/uapi/asm/stat.h), 104 bytes. */
struct stat {
	unsigned long st_dev;
	unsigned long __st_pad0[3];
	ino_t st_ino;           /* The entry's number, the same for the whole run. */
	mode_t st_mode;         /* What it is (S_ISDIR, S_ISREG) and its permissions. */
	nlink_t st_nlink;       /* How many names it has: 1. */
	uid_t st_uid;
	gid_t st_gid;
	unsigned long st_rdev;
	unsigned long __st_pad1[3];
	off_t st_size;          /* A file's length in bytes; 0 for a folder. */
	long st_atime;
	unsigned long st_atime_nsec;
	long st_mtime;
	unsigned long st_mtime_nsec;
	long st_ctime;
	unsigned long st_ctime_nsec;
	unsigned long st_blksize;
	unsigned long __st_pad2;
	blkcnt_t st_blocks;
};
#else
/* Linux's generic struct stat64 on RV32 and struct stat on RV64 (include/uapi/asm-generic/stat.h): 104 and 128
   bytes, the same up to the times, which are 32-bit on RV32 and 64-bit on RV64. */
struct stat {
	unsigned long long st_dev;
	ino_t st_ino;           /* The entry's number, the same for the whole run. */
	mode_t st_mode;         /* What it is (S_ISDIR, S_ISREG) and its permissions. */
	nlink_t st_nlink;       /* How many names it has: 1. */
	uid_t st_uid;
	gid_t st_gid;
	unsigned long long st_rdev;
	unsigned long long __st_pad1;
	off_t st_size;          /* A file's length in bytes; 0 for a folder. */
	int st_blksize;
	int __st_pad2;
	blkcnt_t st_blocks;
	long st_atime;
	unsigned long st_atime_nsec;
	long st_mtime;
	unsigned long st_mtime_nsec;
	long st_ctime;
	unsigned long st_ctime_nsec;
	unsigned int __st_unused4;
	unsigned int __st_unused5;
};
#endif

/* st_mode: what an entry is, in the bits S_IFMT selects, */
#define S_IFMT   0170000
#define S_IFDIR  0040000
#define S_IFREG  0100000
#define S_IFCHR  0020000
#define S_IFBLK  0060000
#define S_IFIFO  0010000
#define S_IFLNK  0120000
#define S_IFSOCK 0140000
/* and the questions to ask of it. */
#define S_ISDIR(mode)  (((mode) & S_IFMT) == S_IFDIR)
#define S_ISREG(mode)  (((mode) & S_IFMT) == S_IFREG)
#define S_ISCHR(mode)  (((mode) & S_IFMT) == S_IFCHR)
#define S_ISBLK(mode)  (((mode) & S_IFMT) == S_IFBLK)
#define S_ISFIFO(mode) (((mode) & S_IFMT) == S_IFIFO)
#define S_ISLNK(mode)  (((mode) & S_IFMT) == S_IFLNK)
#define S_ISSOCK(mode) (((mode) & S_IFMT) == S_IFSOCK)

/* The permission bits, which every entry has all of. */
#define S_IRWXU 0700
#define S_IRUSR 0400
#define S_IWUSR 0200
#define S_IXUSR 0100
#define S_IRWXG 0070
#define S_IRGRP 0040
#define S_IWGRP 0020
#define S_IXGRP 0010
#define S_IRWXO 0007
#define S_IROTH 0004
#define S_IWOTH 0002
#define S_IXOTH 0001

/** Describes what is at path in *buf: its kind and permissions in st_mode, a file's size in st_size; returns 0, or -1 with errno set (ENOENT when nothing is there). */
int stat(const char *path, struct stat *buf);
/** Makes a folder at path, whose own folder must exist, ignoring mode; returns 0, or -1 with errno set (EEXIST when something is there already). */
int mkdir(const char *path, mode_t mode);

#ifdef __cplusplus
}
#endif

#endif
