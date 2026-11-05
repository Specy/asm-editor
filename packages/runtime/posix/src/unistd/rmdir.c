/* Runtime library: rmdir (written for this library), over the folder call 1031. */
#include <unistd.h>
#include "aed_folder.h"

int rmdir(const char *path)
{
	return (int)__aed_folder_result(__aed_folder_call(AED_SYS_RMDIR, (long)path, 0, 0));
}
