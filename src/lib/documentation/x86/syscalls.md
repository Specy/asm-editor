## The ones to start with {#common}

A program uses the Linux x86-64 syscall convention implemented by this emulator. Put the call number in `rax`, arguments in `rdi`, `rsi`, `rdx`, `r10`, `r8`, and `r9`, and read the result from `rax`. Results from -1 through -4095 encode errors; `rcx` and `r11` are changed by the instruction.

A C or C++ program makes the same calls through `<sim.h>`. Each syscall entry names its function in **From C**; for example, `sim_write(1, "Hi\n", 3);` writes those bytes to standard output. The function returns the raw `rax` result, including a negative error code rather than converting errors to C's `-1`.

## Everything this emulator implements {#all}

Every call the emulator implements is listed here. A call missing from this page usually fails with `-ENOSYS` (-38), the Linux error for an unavailable syscall.

## Differences from Linux {#differences}

The simulated environment has one process and one thread. Signals target that process only, and `wait4` returns `ECHILD` because there are no child processes. `fork`, socket networking, and external processes are unavailable; job-control stop signals end the program because there is no stopped job to resume. Pipes connect descriptors within this process.

Calendar clocks (REALTIME, REALTIME_COARSE and TAI) report Unix epoch time: host calendar time interactively, and 2000-01-01 UTC plus virtual elapsed time in Testcases. TAI currently shares realtime without a leap-second offset. Monotonic clocks and BOOTTIME report elapsed time; virtual elapsed time advances only through waits. Process and thread CPU clocks count executed instructions at nominal 100 MHz, exclude waiting durations, and rewind with Undo. `ITIMER_VIRTUAL` and `ITIMER_PROF` still return `EOPNOTSUPP`; CPU interval timers are not implemented. Testcases use scripted input and seeded randomness. A scripted wait with no possible input or timer wake fails.

Wait requests retain nanosecond precision. At very large elapsed times, a requested wait smaller than the clock's next representable increment fails with a precision error.

The working directory `/project` exposes the Project's Files. A program starts with the current Project Files; each Testcase gets an independent copy, and changes made by a program remain in the Project Files after Stop. Directories are implicit path prefixes. Empty directories, moving directories, links, and persistent permissions, ownership, or timestamps are not represented. Metadata is synthetic: mode `0777`, uid and gid zero, and epoch timestamps. A directory disappears when its last file is removed, and replacing a destination with `rename` returns `EEXIST`. File-backed `mmap` returns `ENODEV`; anonymous mappings work. With `readv` (reading into several buffers), an error in a later buffer can be returned after earlier buffers have already changed; Linux may instead return the earlier partial byte count. `writev` and `pwritev` gather their buffers into one payload, so a capacity refusal writes none of it.

Standard streams are a terminal with line-based input and UTF-8 bytes. Enter submits a line. Ctrl+D on an empty line submits one end-of-input token. Duplicated descriptors and `readv` share the same input queue. Programs cannot switch the Terminal to raw mode. SGR color changes and clear-screen sequences are displayed, but full cursor positioning and a fixed character grid are unavailable. When a timer signal interrupts a read, the handler preserves queued bytes and a partially typed line. The call follows Linux's `EINTR` rule (return an interrupted-call error) and `SA_RESTART` option (automatically resume selected calls).

Undo restores CPU state and the Random source position for reversible instructions. Printing is reversible, and printed transcript remains visible after Undo. Consuming standard input or changing Files, descriptors, pipes, memory mappings, credentials, resource limits, signal actions, or timers is an Undo barrier. The instruction appears in History, but Undo stops before it and leaves both CPU and peripheral state as they were. This also applies when a barrier occurs inside a grouped library call.
