/* Runtime library: rename (written for this library), over the folder call 1034. */
#include <stdio.h>
#include "aed_folder.h"

int rename(const char *from, const char *to)
{
	return (int)__aed_folder_result(__aed_folder_call(AED_SYS_RENAME, (long)from, (long)to, 0));
}
