/* Derived from musl 1.2.6 src/stdio/__fmodeflags.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: returns the platform's open mode (AED_OPEN_READ, AED_OPEN_WRITE or AED_OPEN_APPEND) instead of
 * open(2) flags. The Cores have no read-write mode, so "r+" opens for reading, "w+" for writing (truncating)
 * and "a+" for appending; "x" is handled by fopen. */
#include <string.h>
#include "stdio_impl.h"

int __fmodeflags(const char *mode)
{
	if (*mode == 'r') return AED_OPEN_READ;
	if (*mode == 'a') return AED_OPEN_APPEND;
	return AED_OPEN_WRITE;
}
