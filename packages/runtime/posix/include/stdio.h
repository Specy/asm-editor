/* Runtime library, ABI v1, MIPS and RISC-V: <stdio.h>. The Runtime library's <stdio.h>, which it includes first, and
   rename and remove, which the folder calls make possible. */
#ifndef _AED_POSIX_STDIO_H
#define _AED_POSIX_STDIO_H

#if !defined(__mips__) && !defined(__riscv)
#error "This <stdio.h> is the MIPS and RISC-V one, included in a compilation for another Target"
#endif

#include_next <stdio.h>

#ifdef __cplusplus
extern "C" {
#endif

/** Renames or moves the file at from to the path to, whose folder must exist, replacing a file already at to; returns 0, or -1 with errno set: EISDIR when either path is a folder, but ENOTDIR for a folder onto a file. */
int rename(const char *from, const char *to);
/** Deletes the file at path, or the folder at path when it is empty; returns 0, or -1 with errno set. */
int remove(const char *path);

#ifdef __cplusplus
}

extern "C++" {
namespace std {
using ::rename; using ::remove;
}
}
#endif

#endif
