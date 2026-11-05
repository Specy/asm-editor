/* Runtime library, ABI v1, MIPS and RISC-V: <dirent.h>. opendir, readdir and closedir, which list a folder one entry at
   a time over the getdents call: "." and ".." first, then its files and folders. */
#ifndef _DIRENT_H
#define _DIRENT_H

#if !defined(__mips__) && !defined(__riscv)
#error "This <dirent.h> is the MIPS and RISC-V one, included in a compilation for another Target"
#endif

#include <sys/types.h>

#ifdef __cplusplus
extern "C" {
#endif

/* One entry of a folder, as readdir gives it. */
struct dirent {
	ino_t d_ino;              /* The entry's number, the one stat gives in st_ino. */
	off_t d_off;
	unsigned short d_reclen;
	unsigned char d_type;     /* What it is: DT_DIR or DT_REG. */
	char d_name[256];         /* Its name, ending with a NUL. */
};

/* d_type: what an entry is. */
#define DT_UNKNOWN 0
#define DT_FIFO    1
#define DT_CHR     2
#define DT_DIR     4  /* A folder. */
#define DT_BLK     6
#define DT_REG     8  /* A file. */
#define DT_LNK     10
#define DT_SOCK    12

/* A folder being read, which opendir returns and the other functions take. */
typedef struct __dirstream DIR;

/** Opens the folder at path for readdir; returns a DIR, or NULL with errno set (ENOENT, or ENOTDIR for a file). */
DIR *opendir(const char *path);
/** The folder's next entry, "." and ".." first; NULL at the end, with errno unchanged, or NULL with errno set on a failure. */
struct dirent *readdir(DIR *dir);
/** Closes a folder opendir opened and frees it; returns 0. */
int closedir(DIR *dir);

#ifdef __cplusplus
}
#endif

#endif
