/* Runtime library: remove (written for this library). C's remove deletes a file, and POSIX's an empty folder too: an
   unlink, then an rmdir when the path is a folder. */
#include <stdio.h>
#include "aed_folder.h"

int remove(const char *path)
{
	long result = __aed_folder_call(AED_SYS_UNLINK, (long)path, 0, 0);
	if (result == -EISDIR) result = __aed_folder_call(AED_SYS_RMDIR, (long)path, 0, 0);
	return (int)__aed_folder_result(result);
}
