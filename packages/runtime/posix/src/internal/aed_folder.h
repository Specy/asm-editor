/* Internal: the folder calls of MIPS and RISC-V (ADR 0072), Linux's numbers from the asm-generic block RARS's Open
   1024 came from, the same on both Targets. Each returns what Linux returns: 0 or a count, or minus the error
   number, which __aed_folder_result turns into C's -1 and errno. */
#ifndef AED_FOLDER_H
#define AED_FOLDER_H

#include <errno.h>
#include "aed_sys.h"

#define AED_SYS_UNLINK 1026
#define AED_SYS_MKDIR 1030
#define AED_SYS_RMDIR 1031
#define AED_SYS_RENAME 1034
#define AED_SYS_STAT 1038
#define AED_SYS_GETDENTS 1065

static inline long __aed_folder_call(long n, long a, long b, long c)
{
#if defined(__mips__)
	return __aed_syscall3(n, a, b, c);
#else
	return __aed_ecall3(n, a, b, c);
#endif
}

/* -1 with errno set for a failure, the result itself otherwise. */
static inline long __aed_folder_result(long result)
{
	if (result < 0) {
		errno = (int)-result;
		return -1;
	}
	return result;
}

#endif
