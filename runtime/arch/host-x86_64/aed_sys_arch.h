/* Platform contract v1 for native testing on x86-64 Linux (not a Target): Linux system calls through the syscall instruction. */
#ifndef AED_SYS_ARCH_H
#define AED_SYS_ARCH_H

static inline long __aed_linux3(long n, long a, long b, long c)
{
	long ret;
	__asm__ __volatile__ ("syscall" : "=a"(ret) : "a"(n), "D"(a), "S"(b), "d"(c) : "rcx", "r11", "memory");
	return ret;
}

static inline long __aed_read(int fd, void *buf, unsigned long n)
{
	long r = __aed_linux3(0, fd, (long)buf, (long)n);
	return r < 0 ? -1 : r;
}

static inline long __aed_write(int fd, const void *buf, unsigned long n)
{
	long r = __aed_linux3(1, fd, (long)buf, (long)n);
	return r < 0 ? -1 : r;
}

static inline int __aed_open(const char *path, int mode)
{
	/* O_RDONLY 0; O_WRONLY 1 | O_CREAT 0100 | O_TRUNC 01000 or O_APPEND 02000. */
	long flags = mode == 0 ? 0 : mode == 9 ? 01 | 0100 | 02000 : 01 | 0100 | 01000;
	long r = __aed_linux3(2, (long)path, flags, 0644);
	return r < 0 ? -1 : (int)r;
}

static inline int __aed_close(int fd)
{
	return __aed_linux3(3, fd, 0, 0) < 0 ? -1 : 0;
}

static inline long __aed_lseek(int fd, long offset, int whence)
{
	long r = __aed_linux3(8, fd, offset, whence);
	return r < 0 ? -1 : r;
}

static inline void *__aed_sbrk(long increment)
{
	/* brk(0) reports the current break; brk(new) returns the break it could set. */
	unsigned long cur = __aed_linux3(12, 0, 0, 0);
	if (increment == 0) return (void *)cur;
	if ((unsigned long)__aed_linux3(12, (long)(cur + increment), 0, 0) != cur + increment) return (void *)-1;
	return (void *)cur;
}

static inline _Noreturn void __aed_exit(int code)
{
	for (;;) __aed_linux3(231, code, 0, 0);
}

static inline long long __aed_time_ms(void)
{
	struct { long sec, nsec; } ts;
	__aed_linux3(228, 0 /* CLOCK_REALTIME */, (long)&ts, 0);
	return ts.sec * 1000LL + ts.nsec / 1000000;
}

#endif
