/* Runtime library: unlink (written for this library), over the folder call 1026. */
#include <unistd.h>
#include "aed_folder.h"

int unlink(const char *path)
{
	return (int)__aed_folder_result(__aed_folder_call(AED_SYS_UNLINK, (long)path, 0, 0));
}
