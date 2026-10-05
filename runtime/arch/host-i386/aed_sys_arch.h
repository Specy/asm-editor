/* Platform contract v1 for native testing on i386 Linux (not a Target): Linux system calls through int $0x80.
   It exercises the ILP32 paths, and the 64-bit helper routines, that the 32-bit Targets use. */
#ifndef AED_SYS_ARCH_H
#define AED_SYS_ARCH_H

static inline long __aed_linux3(long n, long a, long b, long c)
{
	long ret;
	__asm__ __volatile__ ("int $0x80" : "=a"(ret) : "a"(n), "b"(a), "c"(b), "d"(c) : "memory");
	return ret;
}

static inline long __aed_read(int fd, void *buf, unsigned long n)
{
	long r = __aed_linux3(3, fd, (long)buf, (long)n);
	return r < 0 ? -1 : r;
}

static inline long __aed_write(int fd, const void *buf, unsigned long n)
{
	long r = __aed_linux3(4, fd, (long)buf, (long)n);
	return r < 0 ? -1 : r;
}

static inline int __aed_open(const char *path, int mode)
{
	long flags = mode == 0 ? 0 : mode == 9 ? 01 | 0100 | 02000 : 01 | 0100 | 01000;
	long r = __aed_linux3(5, (long)path, flags, 0644);
	return r < 0 ? -1 : (int)r;
}

static inline int __aed_close(int fd)
{
	return __aed_linux3(6, fd, 0, 0) < 0 ? -1 : 0;
}

static inline long __aed_lseek(int fd, long offset, int whence)
{
	long r = __aed_linux3(19, fd, offset, whence);
	return r < 0 ? -1 : r;
}

static inline void *__aed_sbrk(long increment)
{
	unsigned long cur = __aed_linux3(45, 0, 0, 0);
	if (increment == 0) return (void *)cur;
	if ((unsigned long)__aed_linux3(45, (long)(cur + increment), 0, 0) != cur + increment) return (void *)-1;
	return (void *)cur;
}

static inline _Noreturn void __aed_exit(int code)
{
	for (;;) __aed_linux3(252, code, 0, 0);
}

static inline long long __aed_time_ms(void)
{
	struct { long long sec; long long nsec; } ts; /* clock_gettime64 */
	__aed_linux3(403, 0 /* CLOCK_REALTIME */, (long)&ts, 0);
	return ts.sec * 1000 + ts.nsec / 1000000;
}

#endif
