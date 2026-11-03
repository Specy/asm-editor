/* Runtime library: closedir (written for this library). */
#include <dirent.h>
#include <stdlib.h>
#include "aed_sys.h"
#include "dirent_impl.h"

int closedir(DIR *dir)
{
	__aed_close(dir->fd);
	free(dir);
	return 0;
}
