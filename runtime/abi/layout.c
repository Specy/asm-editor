/*
 * The Runtime ABI's layout table: what a program compiled against these headers depends on besides
 * the library's function names. scripts/runtime/build.mjs compiles this file for each Target, reads
 * the values back from the assembly in order, and compares them with the recorded baseline
 * (runtime/abi/<abi>.json): a struct that changes size or a field that moves, or a constant that
 * changes value, would break Generated assembly compiled against an earlier implementation of the
 * same ABI (ADR 0031). Add entries at the end; never reorder or remove one.
 */
#include <errno.h>
#include <inttypes.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <time.h>

#define ENTRY(value) (long)(value)
#define LAYOUT ENTRY

const long __aed_layout[] = {
	LAYOUT(sizeof(div_t)),
	LAYOUT(offsetof(div_t, rem)),
	LAYOUT(sizeof(ldiv_t)),
	LAYOUT(offsetof(ldiv_t, rem)),
	LAYOUT(sizeof(lldiv_t)),
	LAYOUT(offsetof(lldiv_t, rem)),
	LAYOUT(sizeof(imaxdiv_t)),
	LAYOUT(offsetof(imaxdiv_t, rem)),
	LAYOUT(sizeof(fpos_t)),
	LAYOUT(sizeof(max_align_t)),
	LAYOUT(_Alignof(max_align_t)),
	LAYOUT(sizeof(struct tm)),
	LAYOUT(offsetof(struct tm, tm_sec)),
	LAYOUT(offsetof(struct tm, tm_min)),
	LAYOUT(offsetof(struct tm, tm_hour)),
	LAYOUT(offsetof(struct tm, tm_mday)),
	LAYOUT(offsetof(struct tm, tm_mon)),
	LAYOUT(offsetof(struct tm, tm_year)),
	LAYOUT(offsetof(struct tm, tm_wday)),
	LAYOUT(offsetof(struct tm, tm_yday)),
	LAYOUT(offsetof(struct tm, tm_isdst)),
	LAYOUT(sizeof(time_t)),
	LAYOUT(sizeof(clock_t)),
	LAYOUT(sizeof(size_t)),
	LAYOUT(sizeof(intmax_t)),
	LAYOUT(EOF),
	LAYOUT(BUFSIZ),
	LAYOUT(FILENAME_MAX),
	LAYOUT(FOPEN_MAX),
	LAYOUT(SEEK_SET),
	LAYOUT(SEEK_CUR),
	LAYOUT(SEEK_END),
	LAYOUT(_IOFBF),
	LAYOUT(_IOLBF),
	LAYOUT(_IONBF),
	LAYOUT(EXIT_SUCCESS),
	LAYOUT(EXIT_FAILURE),
	LAYOUT(RAND_MAX),
	LAYOUT(CLOCKS_PER_SEC),
	LAYOUT(EPERM),
	LAYOUT(ENOENT),
	LAYOUT(EIO),
	LAYOUT(EBADF),
	LAYOUT(EAGAIN),
	LAYOUT(ENOMEM),
	LAYOUT(EACCES),
	LAYOUT(EEXIST),
	LAYOUT(EINVAL),
	LAYOUT(EMFILE),
	LAYOUT(ENOSPC),
	LAYOUT(ESPIPE),
	LAYOUT(EDOM),
	LAYOUT(ERANGE),
	LAYOUT(ENOSYS),
	LAYOUT(EOVERFLOW),
	LAYOUT(EILSEQ),
};
