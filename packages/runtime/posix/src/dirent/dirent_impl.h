/* Internal: what a DIR holds. getdents fills `records` with Linux's linux_dirent records, whose first two fields are
   unsigned long, and readdir copies one at a time into `entry`, the struct dirent it returns. */
#ifndef AED_DIRENT_IMPL_H
#define AED_DIRENT_IMPL_H

#include <dirent.h>

#define AED_DIRENT_BUFFER 2048

struct __aed_linux_dirent {
	unsigned long d_ino;
	unsigned long d_off;
	unsigned short d_reclen;
	char d_name[];          /* then a NUL, padding, and d_type in the record's last byte */
};

struct __dirstream {
	int fd;
	int position;           /* where the next record starts in records */
	int size;               /* how many bytes the last getdents stored */
	unsigned long records[AED_DIRENT_BUFFER / sizeof(unsigned long)];
	struct dirent entry;
};

#endif
