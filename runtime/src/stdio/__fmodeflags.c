/* Platform open flags: reference modes plus read-write extensions. */
#include <string.h>
#include "stdio_impl.h"
int __fmodeflags(const char *mode)
{
    int update = strchr(mode, '+') != 0;
    if (*mode == 'r') return update ? AED_OPEN_READWRITE : AED_OPEN_READ;
    if (*mode == 'a') return update ? AED_OPEN_READWRITE_APPEND : AED_OPEN_APPEND;
    return update ? AED_OPEN_READWRITE_TRUNCATE : AED_OPEN_WRITE;
}
