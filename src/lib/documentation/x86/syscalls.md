## The ones to start with {#common}

A program here runs as a Linux program, so everything outside its own memory happens through `syscall`. Put the call number in `rax`, the arguments in `rdi`, `rsi`, `rdx`, `r10`, `r8` and `r9`, and read the result from `rax`. A result between -1 and -4095 is an error code. `rcx` and `r11` do not survive the call.

A C or C++ program makes the same calls through `<sim.h>`: each call below names its function in its **From C** field, and `sim_write(1, "Hi\n", 3);` prints as `write` does. The function returns what `rax` holds after the call, so a failure is the same negative error code rather than C's -1. It is compiled into the program itself, so the same instructions appear in its Generated assembly.

## Everything this emulator implements {#all}

Every call the emulator implements is here. A call missing from this page fails, usually with `-ENOSYS` (-38), which is what Linux returns for a call it does not have.

## Differences from Linux {#differences}

The environment is one process and one thread in the browser. Signals target that process only; `wait4` returns ECHILD. There is no `fork`, socket networking, external process or process group to resume a stopped job. Job-control stop signals therefore end the guest. Pipes connect descriptors inside this process.

Clocks report **Program time**, starting at zero on each Build. Interactive time follows the host without pacing instructions. A Testcase selects its virtual clock, scripted input and seeded Random source before loading the process, including the loader's `AT_RANDOM`: only waits advance virtual time, so computing or querying a clock does not. CPU clocks approximate this elapsed time; ITIMER_VIRTUAL and ITIMER_PROF return EOPNOTSUPP because there is no guest CPU-time model. An indefinite scripted wait without an input or timer wake fails with a clear error.

Virtual waits preserve nanosecond requests while elapsed milliseconds have enough floating-point precision. At very large elapsed times, a wait smaller than the clock's next representable value fails with a precision error.

The working directory `/project` exposes the Project's Files. A Build gets a fresh FileSystem session, and every Testcase gets an independent copy. Stop keeps the Files the program changed. Directories are implicit path prefixes: creating or removing empty Directories, moving Directories, links and persistent permissions, ownership or timestamps have no representation. Metadata is synthetic: mode 0777, uid/gid zero and epoch timestamps. A Directory disappears with its last File; replacement rename returns EEXIST. File-backed `mmap` returns ENODEV; anonymous mappings are supported. A later `readv` callback error can return errno after an earlier vector's effects, where Linux would return its earlier partial byte count. `writev` and `pwritev` gather one payload, so a capacity refusal is atomic.

Standard streams are a tty with canonical input and UTF-8 bytes. Enter releases a line, Ctrl+D on an empty line releases one End of input token, and `dup` and `readv` share the byte queue. Programs cannot switch the Terminal to raw mode. SGR colours and clear-screen sequences are displayed; full terminal cursor positioning and a fixed grid are unavailable. A timer handler preserves queued input and a partially typed line, with Linux's EINTR and SA_RESTART behavior.

Undo restores CPU state and the Random source position for reversible instructions. Instructions that consume standard input or change Files, descriptors, pipes, mappings, credentials, limits, signals or timers remain visible in History as barriers. Undo stops before these unjournaled effects, including a barrier inside a grouped library call, before changing any CPU or Peripheral state. Full File/stdin journaling and transcript Undo are deferred; printing alone is reversible, and the transcript stays visible after Undo.
