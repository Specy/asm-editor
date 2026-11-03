/* Runtime library: opendir (written for this library). A folder opened for reading gives a descriptor getdents
   reads. stat says first why a path cannot be opened, since Open reports only -1. */
#include <dirent.h>
#include <errno.h>
#include <stdlib.h>
#include <sys/stat.h>
#include "aed_sys.h"
#include "dirent_impl.h"

DIR *opendir(const char *path)
{
	struct stat info;
	if (stat(path, &info) != 0) return 0;
	if (!S_ISDIR(info.st_mode)) {
		errno = ENOTDIR;
		return 0;
	}
	DIR *dir = malloc(sizeof *dir);
	if (!dir) {
		errno = ENOMEM;
		return 0;
	}
	int fd = __aed_open(path, AED_OPEN_READ);
	if (fd < 0) {
		free(dir);
		/* the folder is there, so what is missing is a descriptor */
		errno = EMFILE;
		return 0;
	}
	dir->fd = fd;
	dir->position = 0;
	dir->size = 0;
	return dir;
}
