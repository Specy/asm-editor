/* Runtime library, ABI v1, MIPS and RISC-V: <unistd.h>. unlink and rmdir, which delete a file and an empty folder,
   and the numbers of the standard descriptors. */
#ifndef _UNISTD_H
#define _UNISTD_H

#if !defined(__mips__) && !defined(__riscv)
#error "This <unistd.h> is the MIPS and RISC-V one, included in a compilation for another Target"
#endif

#include <sys/types.h>

#ifdef __cplusplus
extern "C" {
#endif

#define STDIN_FILENO  0
#define STDOUT_FILENO 1
#define STDERR_FILENO 2

/** Deletes the file at path; returns 0, or -1 with errno set (EISDIR for a folder, which rmdir deletes). */
int unlink(const char *path);
/** Deletes the folder at path when it is empty; returns 0, or -1 with errno set (ENOTEMPTY when it holds anything). */
int rmdir(const char *path);

#ifdef __cplusplus
}
#endif

#endif
