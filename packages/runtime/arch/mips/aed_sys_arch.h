/* Platform contract v1 for MIPS (MARS): syscall with the service number in $v0, arguments in $a0-$a2, result in $v0. */
#ifndef AED_SYS_ARCH_H
#define AED_SYS_ARCH_H

#define AED_SYS_SBRK 1100
#define AED_SYS_OPEN 13
#define AED_SYS_READ 14
#define AED_SYS_WRITE 15
#define AED_SYS_CLOSE 16
#define AED_SYS_EXIT 17
#define AED_SYS_TIME 30
#define AED_SYS_LSEEK 62

static inline long __aed_syscall3(long n, long a, long b, long c)
{
	register long v0 __asm__("$2") = n;
	register long a0 __asm__("$4") = a;
	register long a1 __asm__("$5") = b;
	register long a2 __asm__("$6") = c;
	__asm__ __volatile__ ("syscall" : "+r"(v0) : "r"(a0), "r"(a1), "r"(a2) : "memory");
	return v0;
}

static inline long __aed_read(int fd, void *buf, unsigned long n)
{
	return __aed_syscall3(AED_SYS_READ, fd, (long)buf, (long)n);
}

static inline long __aed_write(int fd, const void *buf, unsigned long n)
{
	return __aed_syscall3(AED_SYS_WRITE, fd, (long)buf, (long)n);
}

static inline int __aed_open(const char *path, int mode)
{
	return (int)__aed_syscall3(AED_SYS_OPEN, (long)path, mode, 0);
}

static inline int __aed_close(int fd)
{
	/* MARS's close returns nothing, so $v0 is ignored. */
	__aed_syscall3(AED_SYS_CLOSE, fd, 0, 0);
	return 0;
}

static inline long __aed_lseek(int fd, long offset, int whence)
{
	return __aed_syscall3(AED_SYS_LSEEK, fd, offset, whence);
}

static inline void *__aed_sbrk(long increment)
{
	return (void *)__aed_syscall3(AED_SYS_SBRK, increment, 0, 0);
}

static inline _Noreturn void __aed_exit(int code)
{
	for (;;) __aed_syscall3(AED_SYS_EXIT, code, 0, 0);
}

static inline long long __aed_time_ms(void)
{
	/* MARS returns the low word in $a0 and the high word in $a1. */
	register long v0 __asm__("$2") = AED_SYS_TIME;
	register long a0 __asm__("$4");
	register long a1 __asm__("$5");
	__asm__ __volatile__ ("syscall" : "+r"(v0), "=r"(a0), "=r"(a1) : : "memory");
	return (long long)(((unsigned long long)(unsigned int)a1 << 32) | (unsigned int)a0);
}

static inline unsigned long long __aed_cpu_ticks(void)
{
    register long v0 __asm__("$2") = 1101;
    register long lo __asm__("$4");
    register long hi __asm__("$5");
    __asm__ __volatile__("syscall" : "+r"(v0), "=r"(lo), "=r"(hi) : : "memory");
    return (((unsigned long long)(unsigned int)hi << 32) | (unsigned int)lo) / 100;
}

#endif
