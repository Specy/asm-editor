import { describe, expect, it } from 'vitest'
import { x86SyscallArgs, X86_SYSCALLS, type X86Syscall } from '$lib/languages/X86/X86-documentation'
import {
    x86SimBinding,
    x86SimHeaderData,
    x86SimPrototype,
    X86_SIM_EXCEPTIONS,
    X86_SIM_ARGUMENT_OVERRIDES,
    X86_SYSCALL_ARGUMENT_REGISTERS,
    type X86SimBinding
} from './syscallBinding'

const binding = (name: string): X86SimBinding =>
    x86SimBinding(X86_SYSCALLS.find((syscall) => syscall.name === name)!)!
const prototype = (name: string) => x86SimPrototype(binding(name))

/** Labels whose argument points at memory, and of those, the memory the kernel only reads. */
const POINTER = /buffer|path|string|iovec|^pointer$|^timespec$|^(?:i|o|io)_/
const READ_ONLY = /^(?:path|string|buffer \(read by the kernel\)|iovec array .*|i_\w+|o_time2)$/

const KEYWORDS = new Set(
    'auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while class delete new operator private protected public template this throw try typename virtual'.split(
        ' '
    )
)

describe('the x86 <sim.h> bindings', () => {
    it('give every call the Documentation lists a function, but rt_sigreturn', () => {
        const { calls, exceptions } = x86SimHeaderData()
        expect(calls.map((call) => call.name)).toEqual(
            X86_SYSCALLS.map((syscall) => syscall.name).filter((name) => name !== 'rt_sigreturn')
        )
        expect(exceptions).toEqual([
            { name: 'rt_sigreturn', number: 15, reason: X86_SIM_EXCEPTIONS.rt_sigreturn }
        ])
        expect(Object.keys(X86_SIM_EXCEPTIONS)).toEqual(['rt_sigreturn'])
    })

    it('take each argument the Documentation names, in its register, as a long or a pointer', () => {
        for (const syscall of X86_SYSCALLS) {
            const sim = x86SimBinding(syscall)
            if (!sim) continue
            const labels = x86SyscallArgs(syscall)
            expect(sim.name).toBe(`sim_${syscall.name}`)
            expect(sim.number).toBe(syscall.number)
            expect(sim.parameters).toHaveLength(labels.length)
            expect(sim.parameters).toHaveLength(syscall.arity)
            sim.parameters.forEach((parameter, index) => {
                const label = labels[index]
                expect(parameter.register).toBe(X86_SYSCALL_ARGUMENT_REGISTERS[index])
                if (X86_SIM_ARGUMENT_OVERRIDES[syscall.name]?.[index]) return
                expect(parameter.type, `${syscall.name} ${label}`).toBe(
                    !POINTER.test(label)
                        ? 'long'
                        : READ_ONLY.test(label)
                          ? 'const void *'
                          : 'void *'
                )
            })
            //names a C or C++ compiler takes, once each
            const names = sim.parameters.map((parameter) => parameter.name)
            expect(new Set(names).size, syscall.name).toBe(names.length)
            for (const name of names) {
                expect(name).toMatch(/^[a-z][a-z0-9]*$/)
                expect(KEYWORDS.has(name), name).toBe(false)
                expect(X86_SYSCALL_ARGUMENT_REGISTERS).not.toContain(name)
            }
        }
    })

    it('return the raw result, but from the calls that end the program', () => {
        for (const syscall of X86_SYSCALLS) {
            const sim = x86SimBinding(syscall)
            if (!sim) continue
            const ends = syscall.name === 'exit' || syscall.name === 'exit_group'
            expect(sim.returns, syscall.name).toBe(ends ? 'void' : 'long')
            expect(sim.noreturn === true, syscall.name).toBe(ends)
        }
    })

    it('read as C prototypes', () => {
        expect(prototype('read')).toBe('long sim_read(long fd, void *buffer, long count)')
        expect(prototype('write')).toBe('long sim_write(long fd, const void *buffer, long count)')
        expect(prototype('getpid')).toBe('long sim_getpid(void)')
        expect(prototype('exit_group')).toBe('void sim_exit_group(long status)')
        expect(prototype('clock_gettime')).toBe('long sim_clock_gettime(long clockid, void *tp)')
        expect(prototype('nanosleep')).toBe(
            'long sim_nanosleep(const void *request, void *remaining)'
        )
        expect(prototype('mmap')).toBe(
            'long sim_mmap(void *address, long size, long prot, long flags, long fd, long offset)'
        )
        expect(prototype('stat')).toBe('long sim_stat(const void *path, void *statbuf)')
        //a name that comes twice is numbered
        expect(prototype('renameat')).toBe(
            'long sim_renameat(long dirfd1, const void *path1, long dirfd2, const void *path2)'
        )
        //strace's bare value, which a pointer reaches only through a cast
        expect(prototype('uname')).toBe('long sim_uname(void *buffer)')
        //the kernel reads utimensat's times, though strace prints them after the call
        expect(prototype('utimensat')).toBe(
            'long sim_utimensat(long dirfd, const void *path, const void *times, long flags)'
        )
    })

    it("follow strace's prefixes for a structure no label names yet, and stop at anything else", () => {
        const call = (args: string[]): X86Syscall => ({
            number: 7,
            name: 'synthetic',
            arity: args.length,
            args,
            blocking: false
        })
        expect(x86SimPrototype(x86SimBinding(call(['io_poll', 'int', 'i_sigset']))!)).toBe(
            'long sim_synthetic(void *poll, long number, const void *set)'
        )
        expect(() => x86SimBinding(call(['file descriptor', 'cookie']))).toThrow(
            `<sim.h> has no C type for synthetic's argument "cookie"`
        )
    })
})

describe('usable Linux pointer prototypes', () => {
    it('accepts real arrays and structure pointers from both C and C++ without integer casts', async () => {
        const { execFileSync } = await import('node:child_process')
        const { mkdtempSync, writeFileSync, rmSync, readFileSync } = await import('node:fs')
        const { tmpdir } = await import('node:os')
        const { join } = await import('node:path')
        const directory = mkdtempSync(join(tmpdir(), 'm7-pointer-bindings-'))
        try {
            writeFileSync(
                join(directory, 'sim.h'),
                readFileSync('src/lib/sourceRuntime/generated/sim/x86_64.h')
            )
            writeFileSync(
                join(directory, 'pointer.c'),
                `#include <sim.h>
struct timespec { long seconds, nanoseconds; };
struct timeval { long seconds, microseconds; };
struct timer { struct timeval interval, value; };
struct pollfd { int fd; short events, revents; };
struct stack { void *address; int flags; long size; };
void pointers(void) {
    char path[] = "file.txt", buffer[1024]; unsigned ids[4]; long offset = 0, base = 0;
    struct timespec ts = {0, 0}; struct timeval tv = {0, 0}; struct timer timer = {{0, 0}, {0, 0}};
    struct pollfd fds[1] = {{0, 1, 0}}; struct stack stack = {buffer, 0, sizeof buffer};
    sim_poll(fds, 1, 0); sim_brk(buffer); sim_ioctl(0, 0x541b, &ids[0]);
    sim_mremap(buffer, sizeof buffer, sizeof buffer, 0, buffer); sim_msync(buffer, sizeof buffer, 0); sim_madvise(buffer, sizeof buffer, 0);
    sim_getitimer(0, &timer); sim_setitimer(0, &timer, &timer); sim_sendfile(1, 3, &offset, 4);
    sim_uname(buffer); sim_gettimeofday(&tv, buffer); sim_getrusage(0, buffer); sim_sysinfo(buffer); sim_times(buffer);
    sim_getgroups(4, ids); sim_setgroups(4, ids); sim_getresuid(&ids[0], &ids[1], &ids[2]); sim_getresgid(&ids[0], &ids[1], &ids[2]);
    sim_rt_sigpending(buffer); sim_sigaltstack(&stack, &stack); sim_utime(path, &tv); sim_statfs(path, buffer); sim_fstatfs(3, buffer);
    sim_arch_prctl(0x1003, &base); sim_sched_getaffinity(0, sizeof buffer, buffer); sim_getdents64(3, buffer, sizeof buffer); sim_set_tid_address(&ids[0]);
    sim_clock_getres(1, &ts); sim_utimes(path, &tv); sim_futimesat(-100, path, &tv);
    sim_pselect6(1, buffer, buffer, buffer, &ts, buffer); sim_ppoll(fds, 1, &ts, buffer, 8);
    sim_fadvise64(3, 0, 8, 0); sim_close_range(3, 4, 0); sim_prctl(38, 1, 0, 0, 0);
}`
            )
            for (const [compiler, standard] of [
                ['gcc', '-std=c17'],
                ['g++', '-std=c++17']
            ])
                expect(() =>
                    execFileSync(
                        compiler,
                        [
                            standard,
                            '-Wall',
                            '-Wextra',
                            '-Werror',
                            '-fsyntax-only',
                            '-I',
                            directory,
                            join(directory, 'pointer.c')
                        ],
                        { stdio: 'pipe' }
                    )
                ).not.toThrow()
        } finally {
            rmSync(directory, { recursive: true, force: true })
        }
    })
})
