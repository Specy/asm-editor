/* Internal: platform contract v1, the only way the Runtime library reaches the system (see runtime/PLATFORM.md).
   Each Target implements these as static inline functions with inline assembly in arch/<target>/aed_sys_arch.h. */
#ifndef AED_SYS_H
#define AED_SYS_H

/* __aed_open modes, the flags MARS and RARS accept. */
#define AED_OPEN_READ 0
#define AED_OPEN_WRITE 1   /* create or truncate */
#define AED_OPEN_READWRITE 2
#define AED_OPEN_READWRITE_TRUNCATE 3
#define AED_OPEN_READWRITE_APPEND 10
#define AED_OPEN_APPEND 9  /* create, write at the end */

/* Returns the number of bytes read, 0 at the end of input, or -1 on error. Descriptor 0 delivers at most one line per call. */
static inline long __aed_read(int fd, void *buf, unsigned long n);
/* Returns the number of bytes written, or -1 on error. Descriptors 1 and 2 print on the Terminal. */
static inline long __aed_write(int fd, const void *buf, unsigned long n);
/* Opens path with an AED_OPEN_* mode; returns a descriptor, or -1 on error. */
static inline int __aed_open(const char *path, int mode);
/* Closes a descriptor; returns 0, or -1 on error. */
static inline int __aed_close(int fd);
/* Moves the position of fd (whence 0 start, 1 current, 2 end); returns the new position, or -1 on error. */
static inline long __aed_lseek(int fd, long offset, int whence);
/* Grows the heap by increment bytes (never negative); returns the previous break, or (void *)-1 on error. */
static inline void *__aed_sbrk(long increment);
/* Ends the program with the given exit code. */
static inline _Noreturn void __aed_exit(int code);
/* Returns the current time in milliseconds since 1970-01-01 UTC. */
static inline long long __aed_time_ms(void);

static inline unsigned long long __aed_cpu_ticks(void);

#include "aed_sys_arch.h"

#endif
