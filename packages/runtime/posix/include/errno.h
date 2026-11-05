/* Runtime library, ABI v1, MIPS and RISC-V: <errno.h>. The Runtime library's <errno.h>, which it includes first, and
   the error numbers only the folder calls report: rmdir's ENOTEMPTY. The values are Linux's generic ones, which
   the folder calls return negated on both Targets. */
#ifndef _AED_POSIX_ERRNO_H
#define _AED_POSIX_ERRNO_H

#if !defined(__mips__) && !defined(__riscv)
#error "This <errno.h> is the MIPS and RISC-V one, included in a compilation for another Target"
#endif

#include_next <errno.h>

#define ENOTEMPTY 39

#endif
