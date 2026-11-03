/*
 * The Runtime ABI's layout table for MIPS and RISC-V's own headers, posix/include: the structs the
 * folder functions fill and the constants a program compares their results with. scripts/build.mjs
 * compiles this file for those Targets alone, with posix/include searched first as a program's
 * compile searches it, and records the values in the same table as layout.c's (ADR 0031). Add
 * entries at the end; never reorder or remove one, and never repeat one of layout.c's.
 */
#include <dirent.h>
#include <errno.h>
#include <stddef.h>
#include <stdio.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>

#define ENTRY(value) (long)(value)
#define LAYOUT ENTRY

const long __aed_posix_layout[] = {
	LAYOUT(sizeof(off_t)),
	LAYOUT(sizeof(ino_t)),
	LAYOUT(sizeof(dev_t)),
	LAYOUT(sizeof(mode_t)),
	LAYOUT(sizeof(nlink_t)),
	LAYOUT(sizeof(uid_t)),
	LAYOUT(sizeof(gid_t)),
	LAYOUT(sizeof(blksize_t)),
	LAYOUT(sizeof(blkcnt_t)),
	LAYOUT(sizeof(ssize_t)),
	LAYOUT(sizeof(struct dirent)),
	LAYOUT(_Alignof(struct dirent)),
	LAYOUT(offsetof(struct dirent, d_ino)),
	LAYOUT(offsetof(struct dirent, d_off)),
	LAYOUT(offsetof(struct dirent, d_reclen)),
	LAYOUT(offsetof(struct dirent, d_type)),
	LAYOUT(offsetof(struct dirent, d_name)),
	LAYOUT(sizeof(struct stat)),
	LAYOUT(_Alignof(struct stat)),
	LAYOUT(offsetof(struct stat, st_dev)),
	LAYOUT(offsetof(struct stat, st_ino)),
	LAYOUT(offsetof(struct stat, st_mode)),
	LAYOUT(offsetof(struct stat, st_nlink)),
	LAYOUT(offsetof(struct stat, st_uid)),
	LAYOUT(offsetof(struct stat, st_gid)),
	LAYOUT(offsetof(struct stat, st_rdev)),
	LAYOUT(offsetof(struct stat, st_size)),
	LAYOUT(offsetof(struct stat, st_blksize)),
	LAYOUT(offsetof(struct stat, st_blocks)),
	LAYOUT(offsetof(struct stat, st_atime)),
	LAYOUT(offsetof(struct stat, st_mtime)),
	LAYOUT(offsetof(struct stat, st_ctime)),
	LAYOUT(DT_UNKNOWN),
	LAYOUT(DT_FIFO),
	LAYOUT(DT_CHR),
	LAYOUT(DT_DIR),
	LAYOUT(DT_BLK),
	LAYOUT(DT_REG),
	LAYOUT(DT_LNK),
	LAYOUT(DT_SOCK),
	LAYOUT(S_IFMT),
	LAYOUT(S_IFDIR),
	LAYOUT(S_IFREG),
	LAYOUT(S_IFCHR),
	LAYOUT(S_IFBLK),
	LAYOUT(S_IFIFO),
	LAYOUT(S_IFLNK),
	LAYOUT(S_IFSOCK),
	LAYOUT(ENOTEMPTY),
	LAYOUT(STDIN_FILENO),
	LAYOUT(STDOUT_FILENO),
	LAYOUT(STDERR_FILENO),
};
