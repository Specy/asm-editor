/* Runtime library: readdir (written for this library). Reads the next linux_dirent record, asking getdents for more
   once the last batch is used up, and copies it into the DIR's own struct dirent. */
#include <dirent.h>
#include <string.h>
#include "aed_folder.h"
#include "dirent_impl.h"

struct dirent *readdir(DIR *dir)
{
	if (dir->position >= dir->size) {
		long size = __aed_folder_call(AED_SYS_GETDENTS, dir->fd, (long)dir->records, sizeof dir->records);
		if (size <= 0) {
			/* 0 is the end of the folder, which leaves errno as it was */
			__aed_folder_result(size);
			return 0;
		}
		dir->size = (int)size;
		dir->position = 0;
	}
	const struct __aed_linux_dirent *record =
		(const struct __aed_linux_dirent *)((const char *)dir->records + dir->position);
	struct dirent *entry = &dir->entry;
	size_t length = strnlen(record->d_name, sizeof entry->d_name - 1);
	entry->d_ino = record->d_ino;
	entry->d_off = record->d_off;
	entry->d_reclen = record->d_reclen;
	entry->d_type = ((const unsigned char *)record)[record->d_reclen - 1];
	memcpy(entry->d_name, record->d_name, length);
	entry->d_name[length] = 0;
	dir->position += record->d_reclen;
	return entry;
}
