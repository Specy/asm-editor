/**
 * How the Environment library, `<sim.h>`, makes each x86 Linux system call from C: one function per
 * call the Core implements, `sim_` and the call's name, taking the call's arguments in the order the
 * kernel reads them and returning what `rax` holds after the call. The Documentation's From C field
 * and `scripts/sim-header/generate.mjs` read the same bindings, so the header and the Documentation
 * cannot disagree ([ADR 0034](../../../../docs/adr/0034-environment-library-is-header-only.md)).
 *
 * Like `documentation/mars/syscallBinding.ts`, it imports only plain data modules, so the generator
 * reads it with plain Node.
 */
import {
    describeX86Syscall,
    x86SyscallArgs,
    X86_SYSCALLS,
    type X86Syscall
} from '../../languages/X86/X86-documentation'

/** The registers the kernel reads a call's arguments from, in order. */
export const X86_SYSCALL_ARGUMENT_REGISTERS = ['rdi', 'rsi', 'rdx', 'r10', 'r8', 'r9'] as const

export type X86ArgumentRegister = (typeof X86_SYSCALL_ARGUMENT_REGISTERS)[number]

/** A C type of x86's `<sim.h>`: every argument is one register's worth, a `long` or a pointer. */
export type X86SimType = 'long' | 'void *' | 'const void *'

export type X86SimParameter = {
    name: string
    type: X86SimType
    register: X86ArgumentRegister
}

export type X86SimBinding = {
    /** `sim_` and the call's name: `sim_write`. */
    name: string
    /** The call's number, which `rax` holds when `syscall` runs. */
    number: number
    parameters: X86SimParameter[]
    /** What `rax` holds after the call, or nothing from a call that ends the program. */
    returns: 'long' | 'void'
    noreturn?: true
}

/**
 * What each argument label of the syscall table becomes in C. The labels are blink's strace types
 * as `scripts/x86-docs/sources.mjs` names them, and the names `x86SyscallArgs` writes for the calls
 * blink does not trace. A label that denotes a pointer (a buffer, a path or string, a structure, an
 * array) is `const void *` when the kernel only reads what it points at and `void *` when it writes
 * there; every other label is a `long`, the width of the register it is passed in. Structures are
 * `void *` rather than their own types, so nothing clashes with `<time.h>` or `<sys/stat.h>` once x86
 * has a Runtime library. `value` is strace's `HEX`, a register it prints as a number, so it is a
 * `long` unless the Linux ABI override below gives it a pointer type.
 */
const ARGUMENTS: Readonly<Record<string, { type: X86SimType; name: string }>> = {
    'file descriptor': { type: 'long', name: 'fd' },
    'directory descriptor': { type: 'long', name: 'dirfd' },
    path: { type: 'const void *', name: 'path' },
    string: { type: 'const void *', name: 'string' },
    'buffer (read by the kernel)': { type: 'const void *', name: 'buffer' },
    'buffer (written by the kernel)': { type: 'void *', name: 'buffer' },
    //the kernel reads the array either way: `readv` writes into the buffers it lists, not into it
    'iovec array (read)': { type: 'const void *', name: 'iov' },
    'iovec array (written)': { type: 'const void *', name: 'iov' },
    pointer: { type: 'void *', name: 'address' },
    'byte count': { type: 'long', name: 'count' },
    size: { type: 'long', name: 'size' },
    offset: { type: 'long', name: 'offset' },
    whence: { type: 'long', name: 'whence' },
    mode: { type: 'long', name: 'mode' },
    accmode: { type: 'long', name: 'mode' },
    'open flags': { type: 'long', name: 'flags' },
    'protection flags': { type: 'long', name: 'prot' },
    'mapping flags': { type: 'long', name: 'flags' },
    atflags: { type: 'long', name: 'flags' },
    signal: { type: 'long', name: 'sig' },
    sighow: { type: 'long', name: 'how' },
    'process id': { type: 'long', name: 'pid' },
    uid: { type: 'long', name: 'uid' },
    gid: { type: 'long', name: 'gid' },
    resource: { type: 'long', name: 'resource' },
    waitflags: { type: 'long', name: 'options' },
    long: { type: 'long', name: 'number' },
    clock: { type: 'long', name: 'clockid' },
    status: { type: 'long', name: 'status' },
    int: { type: 'long', name: 'number' },
    value: { type: 'long', name: 'value' },
    wat_fcntl: { type: 'long', name: 'cmd' },
    //an argument strace leaves unprinted: fcntl's third, an integer or a pointer by command
    un: { type: 'long', name: 'arg' },
    //the time `clock_gettime` writes
    timespec: { type: 'void *', name: 'tp' },
    //strace's structures: `i_` the kernel reads, `o_` it writes, `io_` both
    o_stat: { type: 'void *', name: 'statbuf' },
    i_hand: { type: 'const void *', name: 'act' },
    o_hand: { type: 'void *', name: 'oldact' },
    i_sigset: { type: 'const void *', name: 'set' },
    o_sigset: { type: 'void *', name: 'oldset' },
    i_time: { type: 'const void *', name: 'request' },
    o_time: { type: 'void *', name: 'remaining' },
    //strace prints utimensat's two times after the call, but the kernel only reads them
    o_time2: { type: 'const void *', name: 'times' },
    i_rlimit: { type: 'const void *', name: 'rlim' },
    o_rlimit: { type: 'void *', name: 'rlim' },
    io_fdset: { type: 'void *', name: 'fds' },
    io_timev: { type: 'void *', name: 'timeout' }
}

/** Linux ABI overrides for strace's numeric/unspecified labels. Indices are zero based.
 * Mixed ioctl arguments intentionally use a pointer; fcntl/prctl retain their scalar raw ABI.
 * The old 28 calls and newly enabled sysinfo/setgroups/getresuid/getresgid are audited here.
 */
export const X86_SIM_ARGUMENT_OVERRIDES: Readonly<
    Record<string, Readonly<Record<number, { type: X86SimType; name: string }>>>
> = {
    poll: {
        0: { type: 'void *', name: 'fds' },
        1: { type: 'long', name: 'nfds' },
        2: { type: 'long', name: 'timeout' }
    },
    brk: { 0: { type: 'void *', name: 'address' } },
    ioctl: {
        0: { type: 'long', name: 'fd' },
        1: { type: 'long', name: 'request' },
        2: { type: 'void *', name: 'arg' }
    },
    mremap: {
        0: { type: 'void *', name: 'oldaddress' },
        1: { type: 'long', name: 'oldsize' },
        2: { type: 'long', name: 'newsize' },
        3: { type: 'long', name: 'flags' },
        4: { type: 'void *', name: 'newaddress' }
    },
    msync: {
        0: { type: 'void *', name: 'address' },
        1: { type: 'long', name: 'size' },
        2: { type: 'long', name: 'flags' }
    },
    madvise: {
        0: { type: 'void *', name: 'address' },
        1: { type: 'long', name: 'size' },
        2: { type: 'long', name: 'advice' }
    },
    getitimer: { 0: { type: 'long', name: 'which' }, 1: { type: 'void *', name: 'current' } },
    setitimer: {
        0: { type: 'long', name: 'which' },
        1: { type: 'const void *', name: 'value' },
        2: { type: 'void *', name: 'oldvalue' }
    },
    sendfile: {
        0: { type: 'long', name: 'outfd' },
        1: { type: 'long', name: 'infd' },
        2: { type: 'void *', name: 'offset' },
        3: { type: 'long', name: 'count' }
    },
    uname: { 0: { type: 'void *', name: 'buffer' } },
    gettimeofday: {
        0: { type: 'void *', name: 'timeval' },
        1: { type: 'void *', name: 'timezone' }
    },
    getrusage: { 0: { type: 'long', name: 'who' }, 1: { type: 'void *', name: 'usage' } },
    sysinfo: { 0: { type: 'void *', name: 'info' } },
    times: { 0: { type: 'void *', name: 'buffer' } },
    getgroups: { 0: { type: 'long', name: 'size' }, 1: { type: 'void *', name: 'groups' } },
    setgroups: { 0: { type: 'long', name: 'size' }, 1: { type: 'const void *', name: 'groups' } },
    getresuid: {
        0: { type: 'void *', name: 'ruid' },
        1: { type: 'void *', name: 'euid' },
        2: { type: 'void *', name: 'suid' }
    },
    getresgid: {
        0: { type: 'void *', name: 'rgid' },
        1: { type: 'void *', name: 'egid' },
        2: { type: 'void *', name: 'sgid' }
    },
    rt_sigpending: { 0: { type: 'void *', name: 'set' } },
    sigaltstack: {
        0: { type: 'const void *', name: 'stack' },
        1: { type: 'void *', name: 'oldstack' }
    },
    utime: {
        0: { type: 'const void *', name: 'path' },
        1: { type: 'const void *', name: 'times' }
    },
    statfs: { 0: { type: 'const void *', name: 'path' }, 1: { type: 'void *', name: 'buffer' } },
    fstatfs: { 0: { type: 'long', name: 'fd' }, 1: { type: 'void *', name: 'buffer' } },
    arch_prctl: { 0: { type: 'long', name: 'code' }, 1: { type: 'void *', name: 'address' } },
    sched_getaffinity: {
        0: { type: 'long', name: 'pid' },
        1: { type: 'long', name: 'size' },
        2: { type: 'void *', name: 'mask' }
    },
    getdents64: {
        0: { type: 'long', name: 'fd' },
        1: { type: 'void *', name: 'dirents' },
        2: { type: 'long', name: 'count' }
    },
    set_tid_address: { 0: { type: 'void *', name: 'tid' } },
    clock_getres: {
        0: { type: 'long', name: 'clockid' },
        1: { type: 'void *', name: 'resolution' }
    },
    utimes: {
        0: { type: 'const void *', name: 'path' },
        1: { type: 'const void *', name: 'times' }
    },
    futimesat: {
        0: { type: 'long', name: 'dirfd' },
        1: { type: 'const void *', name: 'path' },
        2: { type: 'const void *', name: 'times' }
    },
    pselect6: {
        0: { type: 'long', name: 'nfds' },
        1: { type: 'void *', name: 'readfds' },
        2: { type: 'void *', name: 'writefds' },
        3: { type: 'void *', name: 'exceptfds' },
        4: { type: 'const void *', name: 'timeout' },
        5: { type: 'const void *', name: 'sigmask' }
    },
    ppoll: {
        0: { type: 'void *', name: 'fds' },
        1: { type: 'long', name: 'nfds' },
        2: { type: 'const void *', name: 'timeout' },
        3: { type: 'const void *', name: 'sigmask' },
        4: { type: 'long', name: 'sigsetsize' }
    }
}

/**
 * The C type and name of an argument label. A structure strace names that the table above does
 * not yet follows strace's own prefixes, and the Documentation's `arg1` for a call nothing names is
 * a `long`; any other label stops here rather than being guessed.
 */
function argument(label: string, call: string): { type: X86SimType; name: string } {
    if (Object.prototype.hasOwnProperty.call(ARGUMENTS, label)) return ARGUMENTS[label]
    const structure = /^(i|o|io)_([a-z][a-z0-9]*)$/.exec(label)
    if (structure)
        return { type: structure[1] === 'i' ? 'const void *' : 'void *', name: structure[2] }
    if (/^arg\d+$/.test(label)) return { type: 'long', name: label }
    throw new Error(`<sim.h> has no C type for ${call}'s argument "${label}"`)
}

/** The calls that end the program, so their functions never return. */
const NORETURN = new Set(['exit', 'exit_group'])

/**
 * The calls the Documentation lists that `<sim.h>` has no function for, and why: the one-to-one
 * rule's single exception ([the plan](../../../../docs/design/environment-library-plan.md), M2).
 */
export const X86_SIM_EXCEPTIONS: Readonly<Record<string, string>> = {
    rt_sigreturn:
        'only the restorer a program registers with rt_sigaction makes it, as a signal handler returns, and called from C it corrupts the program'
}

/** A call's function in `<sim.h>`, or undefined for one of the exceptions. */
export function x86SimBinding(syscall: X86Syscall): X86SimBinding | undefined {
    if (Object.prototype.hasOwnProperty.call(X86_SIM_EXCEPTIONS, syscall.name)) return undefined
    const labels = x86SyscallArgs(syscall)
    if (labels.length > X86_SYSCALL_ARGUMENT_REGISTERS.length)
        throw new Error(`${syscall.name} takes more arguments than registers carry`)
    const parameters = labels.map((label, index) => ({
        ...(X86_SIM_ARGUMENT_OVERRIDES[syscall.name]?.[index] ?? argument(label, syscall.name)),
        register: X86_SYSCALL_ARGUMENT_REGISTERS[index]
    }))
    //a name that comes twice is numbered each time, in order: rename(path1, path2)
    const names = parameters.map((parameter) => parameter.name)
    const seen = new Map<string, number>()
    for (const parameter of parameters) {
        const name = parameter.name
        if (names.indexOf(name) === names.lastIndexOf(name)) continue
        seen.set(name, (seen.get(name) ?? 0) + 1)
        parameter.name = `${name}${seen.get(name)}`
    }
    const noreturn = NORETURN.has(syscall.name)
    return {
        name: `sim_${syscall.name}`,
        number: syscall.number,
        parameters,
        returns: noreturn ? 'void' : 'long',
        ...(noreturn ? { noreturn: true as const } : {})
    }
}

/** The C prototype of a binding: `long sim_write(long fd, const void *buffer, long count)`. */
export function x86SimPrototype(binding: X86SimBinding): string {
    const declare = (type: string, name: string) =>
        type.endsWith('*') ? `${type}${name}` : `${type} ${name}`
    const parameters = binding.parameters.map((parameter) =>
        declare(parameter.type, parameter.name)
    )
    return `${declare(binding.returns, binding.name)}(${parameters.join(', ') || 'void'})`
}

/** What `scripts/sim-header/simHeader.mjs` writes x86's `<sim.h>` from. */
export type X86SimHeaderData = {
    /** Every call with a function, in the table's order, with its Documentation's description. */
    calls: { name: string; description: string; binding: X86SimBinding }[]
    /** The calls with none, and why. */
    exceptions: { name: string; number: number; reason: string }[]
}

export function x86SimHeaderData(): X86SimHeaderData {
    const calls: X86SimHeaderData['calls'] = []
    const exceptions: X86SimHeaderData['exceptions'] = []
    for (const syscall of X86_SYSCALLS) {
        const binding = x86SimBinding(syscall)
        if (binding)
            calls.push({
                name: syscall.name,
                description: describeX86Syscall(syscall.name),
                binding
            })
        else
            exceptions.push({
                name: syscall.name,
                number: syscall.number,
                reason: X86_SIM_EXCEPTIONS[syscall.name]
            })
    }
    return { calls, exceptions }
}
