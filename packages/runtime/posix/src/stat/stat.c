/* Runtime library: stat (written for this library), over the folder call 1038, which fills the Target's struct
   stat as Linux does. */
#include <sys/stat.h>
#include "aed_folder.h"

int stat(const char *path, struct stat *buf)
{
	return (int)__aed_folder_result(__aed_folder_call(AED_SYS_STAT, (long)path, (long)buf, 0));
}
