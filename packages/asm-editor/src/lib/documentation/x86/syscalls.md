## The ones to start with {#common}

A program uses the Linux x86-64 syscall convention implemented by this emulator. Put the call number in `rax`, arguments in `rdi`, `rsi`, `rdx`, `r10`, `r8`, and `r9`, and read the result from `rax`. Results from -1 through -4095 encode errors; `rcx` and `r11` are changed by the instruction. For startup inputs, see [Program arguments](#arguments).

A C or C++ program makes the same calls through `<sim.h>`. Each syscall entry names its function in **From C**; for example, `sim_write(1, "Hi\n", 3);` writes those bytes to standard output. The function returns the raw `rax` result, including a negative error code rather than converting errors to C's `-1`.

## Everything this emulator implements {#all}

Every call the emulator implements is listed here. A call missing from this page usually fails with `-ENOSYS` (-38), the Linux error for an unavailable syscall, and the Workbench's **Log** names it the first time a run makes it.

## Differences from Linux {#differences}

The simulated environment has one process and one thread. Signals target that process only, and `wait4` returns `ECHILD` because there are no child processes. `fork`, socket networking, and external processes are unavailable; job-control stop signals end the program because there is no stopped job to resume. Pipes connect descriptors within this process.

Calendar clocks (REALTIME, REALTIME_COARSE and TAI) report Unix epoch time: host calendar time interactively, and 2000-01-01 UTC plus virtual elapsed time in Testcases. TAI currently shares realtime without a leap-second offset. Monotonic clocks and BOOTTIME report elapsed time; virtual elapsed time advances only through waits. Process and thread CPU clocks count executed instructions at nominal 100 MHz, exclude waiting durations, and rewind with Undo. `ITIMER_VIRTUAL` and `ITIMER_PROF` still return `EOPNOTSUPP`; CPU interval timers are not implemented. Testcases use scripted input and seeded randomness. A scripted wait with no possible input or timer wake fails.

Wait requests retain nanosecond precision. At very large elapsed times, a requested wait smaller than the clock's next representable increment fails with a precision error.

The working directory `/project` exposes the Project's Files. A program starts with the current Project Files; each Testcase gets an independent copy, and changes made by a program remain in the Project Files after Stop. Directories are implicit path prefixes. Empty directories, moving directories, links, and persistent permissions, ownership, or timestamps are not represented. Metadata is synthetic: mode `0777`, uid and gid zero, and epoch timestamps. A directory disappears when its last file is removed, and replacing a destination with `rename` returns `EEXIST`.

A private File mapping with `mmap` (`MAP_PRIVATE`) copies the File's bytes into memory. Writes to that mapping stay in memory. Shared File mappings (`MAP_SHARED`) return `ENODEV`; anonymous mappings work.

With `readv` (reading into several buffers), an error in a later buffer can be returned after earlier buffers have already changed; Linux may instead return the earlier partial byte count. `writev` and `pwritev` gather their buffers into one payload, so a capacity refusal writes none of it.

Standard streams are a terminal with line-based input and UTF-8 bytes. Enter submits a line. Ctrl+D on an empty line submits one end-of-input token. Duplicated descriptors and `readv` share the same input queue. Programs cannot switch the Terminal to raw mode. SGR color changes and clear-screen sequences are displayed, but full cursor positioning and a fixed character grid are unavailable. When a timer signal interrupts a read, the handler preserves queued bytes and a partially typed line. The call follows Linux's `EINTR` rule (return an interrupted-call error) and `SA_RESTART` option (automatically resume selected calls).

Undo restores CPU state and the Random source position for reversible instructions. Printing is reversible, and printed transcript remains visible after Undo. Consuming standard input or changing Files, descriptors, pipes, memory mappings, credentials, resource limits, signal actions, or timers is an Undo barrier. The instruction appears in History, but Undo stops before it and leaves both CPU and peripheral state as they were. This also applies when a barrier occurs inside a grouped library call.

## Program arguments {#arguments}

Enter **Arguments** on the Terminal's first line, the **Command line**, or in the project's **Settings** panel. They take effect at the next Build; during a Debug session, the line shows what the current run started with. Stop the Debug session to edit the Command line. Arguments are startup strings, separate from text the program reads later through Terminal input.

A Testcase can supply its own **Arguments**. An empty or whitespace-only field inherits the project's Arguments, so it cannot request an empty argument list while project Arguments are set.

### Entering argument strings

The field uses these quoting rules:

- Whitespace separates arguments unless quoted or escaped.
- Single quotes (`'two words'`) and double quotes (`"two words"`) keep text in one argument. The quote marks are removed; `''` and `""` each create an empty argument.
- Outside quotes, a backslash takes the next character literally: `two\ words` is one argument. A trailing backslash stays a backslash.
- Inside single quotes, every character is literal, including a backslash. Inside double quotes, a backslash escapes only a double quote, backslash, dollar sign, or backtick; before other characters it remains a backslash.
- Adjacent quoted and unquoted parts form one argument: `pre"two words"` becomes `pretwo words`.
- Nothing expands and no command runs. Characters such as `$`, `*`, `~`, `#`, `|`, `>`, `;`, and `&` are ordinary text.

An unfinished quote stops Build with an **Arguments** problem naming the column where that quote opened.

For a program named `./main`, entering `hello "two words" '' a\ b` produces `argc = 5`:

| Index     | String          |
| --------- | --------------- |
| `argv[0]` | `./main`        |
| `argv[1]` | `hello`         |
| `argv[2]` | `two words`     |
| `argv[3]` | An empty string |
| `argv[4]` | `a b`           |

### Access from assembly and C/C++

`argc` counts all strings, including the program name. `argv` is an array of pointers to NUL-terminated UTF-8 strings; `argv[argc]` is a null pointer marking the array's end. `argv[0]` is `./` plus the Executable's Entry path. For assembled programs it is the Entry path without its final extension, and for compiled programs it is the C or C++ source path without its final extension: `main.asm` and `main.c` both give `./main`. With no user Arguments, `argc` is 1.

At an assembly entry point such as `_start`, the loader supplies the count and pointers on the stack. They are not function arguments in `rdi` and `rsi`. Each count or pointer slot is 8 bytes:

| Location at the initial `rsp` | Contents                               |
| ----------------------------- | -------------------------------------- |
| `[rsp]`                       | `argc`                                 |
| `[rsp + 8]`                   | The pointer `argv[0]`                  |
| `[rsp + 16]`                  | The pointer `argv[1]`, when `argc > 1` |
| `[rsp + 8 * (argc + 1)]`      | The null pointer ending `argv`         |

Before changing `rsp`, `cmp qword [rsp], 2` followed by `jb no_argument` skips a first-argument load when no user argument exists; `no_argument` is a label you supply. Otherwise, `mov rsi, [rsp + 16]` loads the first user argument's string address into `rsi`. For the `write` syscall, also supply its byte length in `rdx`: `write` takes a byte count, rather than searching for the terminating NUL. Save the initial stack pointer or the argument pointers if later stack operations or calls will change the registers you use to reach them.

For C or C++, declare `int main(int argc, char *argv[])`. Startup supplies these function arguments for you. Check `argc > 1` before using `argv[1]`; for example, `if (argc > 1) printf("%s\n", argv[1]);` prints the first user argument when `<stdio.h>` is included. See the [Runtime library](/documentation/x86/runtime-library#compiled-programs) for compiled-program startup and function support.

Startup data occupy the upper stack area and affect its initial address. The [Executable reference](/documentation/x86/executables#arguments) explains the memory-view labels and gives initial-stack examples. A Testcase's starting registers are applied after startup, so overriding `rsp` can hide this layout from your entry code.

### Fixed environment and limits

All x86 programs, including assembled and editor-compiled programs, receive these fixed environment strings in the startup block. `envp`, the null-terminated array of pointers to them, follows the null pointer at the end of `argv`:

| Variable  | Value                          |
| --------- | ------------------------------ |
| `PATH`    | `/usr/local/bin:/usr/bin:/bin` |
| `HOME`    | `/project`                     |
| `PWD`     | `/project`                     |
| `LANG`    | `C.UTF-8`                      |
| `TERM`    | `xterm-256color`               |
| `SHELL`   | `/bin/sh`                      |
| `USER`    | `user`                         |
| `LOGNAME` | `user`                         |

The editor Runtime library's `getenv` always returns NULL; that library does not expose environment variables through the function. An imported Executable using bundled glibc uses glibc's environment functions instead.

The Arguments field may contain at most 1,024 arguments, excluding `argv[0]`. The program name and all argument strings together may use at most 128 KiB, counting their UTF-8 bytes and one terminating NUL byte per string. This byte limit does not count the pointer arrays or environment strings. A string cannot contain a NUL character. Build stops with an Arguments problem if a limit is exceeded.
