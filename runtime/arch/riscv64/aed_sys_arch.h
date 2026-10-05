/* Platform contract v1 for RISC-V (RARS): ecall with the service number in a7, arguments in a0-a2, result in a0.
   Width-independent: arch/riscv32 and arch/riscv64 hold identical copies of this file. */
#ifndef AED_SYS_ARCH_H
#define AED_SYS_ARCH_H

#define AED_SYS_OPEN 1024
#define AED_SYS_CLOSE 57
#define AED_SYS_LSEEK 62
#define AED_SYS_READ 63
#define AED_SYS_WRITE 64
#define AED_SYS_EXIT 93
#define AED_SYS_SBRK 9
#define AED_SYS_TIME 30

static inline long __aed_ecall3(long n, long a, long b, long c)
{
	register long a7 __asm__("a7") = n;
	register long a0 __asm__("a0") = a;
	register long a1 __asm__("a1") = b;
	register long a2 __asm__("a2") = c;
	__asm__ __volatile__ ("ecall" : "+r"(a0) : "r"(a7), "r"(a1), "r"(a2) : "memory");
	return a0;
}

static inline long __aed_read(int fd, void *buf, unsigned long n)
{
	return __aed_ecall3(AED_SYS_READ, fd, (long)buf, (long)n);
}

static inline long __aed_write(int fd, const void *buf, unsigned long n)
{
	return __aed_ecall3(AED_SYS_WRITE, fd, (long)buf, (long)n);
}

static inline int __aed_open(const char *path, int mode)
{
	return (int)__aed_ecall3(AED_SYS_OPEN, (long)path, mode, 0);
}

static inline int __aed_close(int fd)
{
	/* RARS's close returns nothing, so a0 is ignored. */
	__aed_ecall3(AED_SYS_CLOSE, fd, 0, 0);
	return 0;
}

static inline long __aed_lseek(int fd, long offset, int whence)
{
	return __aed_ecall3(AED_SYS_LSEEK, fd, offset, whence);
}

static inline void *__aed_sbrk(long increment)
{
	return (void *)__aed_ecall3(AED_SYS_SBRK, increment, 0, 0);
}

static inline _Noreturn void __aed_exit(int code)
{
	for (;;) __aed_ecall3(AED_SYS_EXIT, code, 0, 0);
}

static inline long long __aed_time_ms(void)
{
	register long a7 __asm__("a7") = AED_SYS_TIME;
	register long a0 __asm__("a0");
	register long a1 __asm__("a1");
	__asm__ __volatile__ ("ecall" : "=r"(a0), "=r"(a1) : "r"(a7) : "memory");
	return (long long)(((unsigned long long)(unsigned int)a1 << 32) | (unsigned int)a0);
}

#endif
