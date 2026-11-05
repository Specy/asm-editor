/**
 * What each x86 Linux call the Core implements does, apart from the rest of the x86 Documentation
 * so that the Pseudocode's hover on a system call (`sys_write`) reads it without the instruction
 * tables (`pseudocodeHovers.ts`). `X86-documentation.ts` re-exports it.
 */
import { X86_SYSCALLS, type X86Syscall } from './generated/x86Syscalls'

export const x86SyscallMap = new Map<string, X86Syscall>(
    X86_SYSCALLS.map((syscall) => [syscall.name, syscall])
)

/**
 * What a call does, for the ones a program here is likely to make. The generated table has the
 * number, the name and the shape of every call blink implements, and nothing about their meaning:
 * the argument types come from blink's strace signatures, which exist to print a trace rather than
 * to explain anything.
 */
export const X86_SYSCALL_DESCRIPTIONS: Record<string, string> = {
    read: 'Reads up to `rdx` bytes from the file descriptor in `rdi` into the buffer at `rsi`, and returns how many it read. Descriptor 0 is standard input, so this is how a program reads what was typed. A return of 0 means end of input.',
    write: 'Writes `rdx` bytes from the buffer at `rsi` to the file descriptor in `rdi`, and returns how many it wrote. Descriptor 1 is standard output and 2 is standard error, so this is how a program prints.',
    open: 'Opens the path at `rdi` with the flags in `rsi` and, when creating, the mode in `rdx`. Returns a file descriptor.',
    close: 'Closes the file descriptor in `rdi`.',
    lseek: 'Moves the read and write position of the descriptor in `rdi` to the offset in `rsi`, interpreted according to `rdx`, and returns the new position.',
    stat: 'Reads file metadata for the path at `rdi` and writes it to the Linux `struct stat` buffer at `rsi`.',
    lstat: 'Like `stat`, but reports a symbolic link itself instead of the file it points to. Writes a Linux `struct stat` to the buffer at `rsi`.',
    fstat: 'Reads file metadata for the descriptor in `rdi` and writes it to the Linux `struct stat` buffer at `rsi`.',
    poll: 'Waits for the `pollfd` array at `rdi` to report requested events, checking `rsi` entries for up to `rdx` milliseconds. A negative timeout waits without a time limit.',
    select: 'Takes the descriptor limit in `rdi`, pointers to the read, write, and exception sets in `rsi`, `rdx`, and `r10`, and an optional timeout in `r8`. Waits until a descriptor is ready or the timeout expires, then updates the sets and timeout.',
    exit: 'Ends the program with the status in `rdi`. It never returns, and a program that reaches the end of its code without calling it runs into whatever bytes follow.',
    exit_group:
        'Ends every thread of the program with the status in `rdi`. For a program with one thread it is `exit`.',
    mmap: 'Maps memory: the length in `rsi`, the protection in `rdx`, the flags in `r10`. An anonymous private mapping is how a program asks for a block of memory it can write to. A `MAP_PRIVATE` mapping of a file under `/project` copies its bytes into memory; writes to the mapping stay in memory. A `MAP_SHARED` mapping of such a file returns `-ENODEV`.',
    mprotect:
        'Changes the read, write, or execute permissions of the `rsi` bytes starting at the page-aligned address in `rdi`.',
    munmap: 'Unmaps the mapping of `rsi` bytes at the address in `rdi`.',
    brk: 'Sets the end address of the heap area. Returns the current break; a request the emulator cannot satisfy leaves it unchanged.',
    pipe: 'Creates a pair of connected file descriptors and writes both integers to the two-element array at `rdi`; reads from one end receive bytes written to the other.',
    dup: 'Returns a new file descriptor that refers to the same open file description as the descriptor in `rdi`.',
    dup2: 'Makes descriptor `rsi` refer to the same open file description as `rdi`, closing the old `rsi` first if needed.',
    readv: 'Reads into the buffers listed by the `iovec` array at `rsi`, with `rdx` entries, from the descriptor in `rdi`; returns the total bytes read. An error in a later buffer can be returned after earlier buffers have already changed, rather than returning the earlier partial byte count. Check those buffers before retrying after an error.',
    writev: 'Writes the buffers listed by the `iovec` array at `rsi`, with `rdx` entries, to the descriptor in `rdi`; returns the total bytes written. The buffers are gathered into one payload before writing. If a capacity limit refuses the write, none of that payload is written.',
    pwritev:
        'Writes the buffers listed by the `iovec` array at `rsi`, with `rdx` entries, to the descriptor in `rdi` at the offset in `r10`; returns the total bytes written without changing the descriptor’s position. The buffers are gathered into one payload before writing. If a capacity limit refuses the write, none of that payload is written.',
    nanosleep: 'Sleeps for the interval at `rdi`, a pair of seconds and nanoseconds.',
    getpid: 'Returns the process id.',
    clock_gettime: `Writes the clock selected by \`rdi\` to the \`timespec\` structure at \`rsi\` (seconds and nanoseconds).

\`CLOCK_REALTIME\`, \`CLOCK_REALTIME_COARSE\` and \`CLOCK_TAI\` report Unix epoch time: host calendar time interactively, and 2000-01-01 UTC plus virtual elapsed time in Testcases. \`CLOCK_TAI\` shares realtime without a leap-second offset.

\`CLOCK_PROCESS_CPUTIME_ID\` and \`CLOCK_THREAD_CPUTIME_ID\` count executed instructions at nominal 100 MHz, exclude waiting time, and rewind with Undo. Monotonic clocks and \`CLOCK_BOOTTIME\` report elapsed time; virtual elapsed time advances only through waits.`,
    time: 'Returns calendar time in whole seconds since the Unix epoch, and also stores it at the address in `rdi` unless `rdi` is 0. Interactive runs use host calendar time; Testcases use 2000-01-01 UTC plus virtual elapsed time.',
    getitimer:
        'Writes the remaining delay and repeat interval of the timer selected by `rdi` to the `itimerval` structure at `rsi`. Only `ITIMER_REAL` is supported. `ITIMER_VIRTUAL` and `ITIMER_PROF` return `-EOPNOTSUPP`.',
    setitimer:
        'Sets the timer selected by `rdi` from the `itimerval` structure at `rsi`, and writes the previous settings at `rdx` when that pointer is nonzero. Only `ITIMER_REAL` is supported; it sends `SIGALRM` when its delay expires. `ITIMER_VIRTUAL` and `ITIMER_PROF` return `-EOPNOTSUPP`.',
    wait4: 'Returns `-ECHILD` immediately because this environment has no child processes.',
    ioctl: 'Asks a device the descriptor in `rdi` refers to for something outside the ordinary read and write interface, chosen by the request in `rsi`.',
    sendfile:
        'Copies up to `r10` bytes from the input descriptor in `rsi` to the output descriptor in `rdi`, optionally updating the input position through the pointer in `rdx`.',
    getcwd: 'Writes the current working directory as a NUL-terminated path to the buffer at `rdi`, up to `rsi` bytes.',
    chdir: 'Changes the program’s current working directory to the path at `rdi`.',
    fchdir: 'Changes the program’s current working directory to the directory referred to by descriptor `rdi`.',
    rename: 'Renames or moves the path at `rdi` to the path at `rsi`. A file already at the destination is replaced, as on Linux, and a descriptor still open on it keeps reading and writing it. Within `/project`, moving a directory returns `-EISDIR`.',
    renameat:
        'Renames or moves the path at `rsi`, relative to the directory descriptor in `rdi`, to the path at `r10`, relative to the directory descriptor in `rdx`. A file already at the destination is replaced, as on Linux. Within `/project`, moving a directory returns `-EISDIR`.',
    renameat2:
        'Renames or moves paths relative to the directory descriptors in `rdi` and `rdx`, using the flags in `r8`. Without flags a file already at the destination is replaced, as on Linux; `RENAME_NOREPLACE` refuses an existing destination with `-EEXIST`, and `RENAME_EXCHANGE` swaps two existing names. Within `/project`, directory moves return `-EISDIR`.',
    mkdir: 'Makes a directory at the path in `rdi`, with the mode in `rsi`. Under `/project` it lasts for the run, and files can be created in it: the first one keeps it after the run, since directories there exist only as prefixes of file paths. One still empty when the program ends is gone.',
    mkdirat:
        'Makes a directory at the path in `rsi`, relative to the directory descriptor in `rdi`, with the mode in `rdx`. Under `/project` it lasts for the run, and files can be created in it: the first one keeps it after the run, since directories there exist only as prefixes of file paths. One still empty when the program ends is gone.',
    rmdir: 'Removes the empty directory named by the path at `rdi`. Under `/project`, a directory that holds files returns `-ENOTEMPTY`, and one that does not disappears by itself when its last file is removed; an empty one made by `mkdir` is removed.',
    unlink: 'Removes the directory entry named by the path at `rdi`; an open file remains available through its descriptor. Under `/project`, removing a directory’s last file also removes that implicit directory.',
    uname: 'Writes system name and version fields to the Linux `struct utsname` buffer at `rdi`.',
    gettimeofday:
        'Writes calendar time since the Unix epoch, in seconds and microseconds, to the `timeval` structure at `rdi`. Interactive runs use host calendar time; Testcases use 2000-01-01 UTC plus virtual elapsed time.',
    getrusage:
        'Writes resource-usage counters for the selected process or children to the `rusage` structure at `rsi`.',
    sysinfo:
        'Writes the emulator’s uptime, memory, and process-count values to a Linux `struct sysinfo` buffer at `rdi`.',
    getgroups:
        'Writes up to `rdi` supplementary group IDs to the array at `rsi`; with a zero size, returns how many IDs are needed.',
    setgroups:
        'Replaces the process’s supplementary group list with the `rdi` group IDs in the array at `rsi`.',
    rt_sigreturn:
        'Returns from a signal handler: restores the registers and the signal mask saved when the signal arrived, and carries on where the program was interrupted. A handler does not make this call itself: it returns into the restorer registered with `rt_sigaction`, and the restorer makes it.'
}

export function describeX86Syscall(name: string): string {
    return X86_SYSCALL_DESCRIPTIONS[name] ?? ''
}
