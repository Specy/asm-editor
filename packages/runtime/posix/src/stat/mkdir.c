/* Runtime library: mkdir (written for this library), over the folder call 1030. Every entry has every permission,
   so the mode is not passed on. */
#include <sys/stat.h>
#include "aed_folder.h"

int mkdir(const char *path, mode_t mode)
{
	(void)mode;
	return (int)__aed_folder_result(__aed_folder_call(AED_SYS_MKDIR, (long)path, 0, 0));
}
