An **Executable** is a program compiled and linked outside the editor, which a Build loads and runs as it is instead of assembling it. It lets you read and debug a program you have no source for, such as a CTF reverse-engineering challenge. **Import** an ELF file on the Projects page to get a new x86 project with it as the Entry file, or upload one in an x86 project's **Explorer** and accept the offer to make it the Entry file. A file is recognised by its first bytes, not its name, so `crackme` or `chall` without an extension works.

## What runs {#what-runs}

x86-64 Linux ELF programs, statically or dynamically linked, position-independent (PIE) or not. Anything else is refused when it arrives, with the reason: a 32-bit x86 program, a program for another machine such as ARM, an object file or a shared library. Uploaded into a project, a refused file stays there as an ordinary File.

The program runs as a Linux process on a terminal, as an assembled program does, at the addresses gdb shows with address randomization off: a PIE at `0x555555554000`, any other program where its headers say (usually `0x400000`), shared libraries just below `0x7ffff7fff000` and the stack below `0x7ffffffff000`. Its working directory is `/project`, which holds the project's Files, so a `flag.txt` beside it opens by name. It can read its own File but not write it (`ETXTBSY`, as on Linux), nor delete or rename it (`EBUSY`, where Linux allows both, so a program cannot remove itself from the project). Its environment is fixed: `PATH`, `HOME=/project`, `PWD=/project`, `LANG=C.UTF-8`, `TERM=xterm-256color`, `SHELL=/bin/sh`, `USER` and `LOGNAME`. It has one thread and no network: creating threads, sockets and `fork` fail.

## Shared libraries {#libraries}

A dynamically linked program loads its libraries from five bundled ones, taken from Ubuntu 26.04 and fetched only when a program needs them: the dynamic linker `ld-linux-x86-64.so.2`, `libc.so.6` and `libm.so.6` from glibc 2.43, and `libstdc++.so.6` and `libgcc_s.so.1` from GCC 16, which C++ programs need. A program that needs any other library, such as `libcrypto.so.3`, does not start: the **Log** names the missing library and the Terminal shows the dynamic linker's error. A program built against a newer glibc stops the same way, with `version 'GLIBC_2.xx' not found`. These libraries are unrelated to the [Runtime library](/documentation/x86/runtime-library), which only programs compiled in the editor use. A static program carries its library code inside itself.

## The Listing {#listing}

Opening an Executable shows its **Listing**: its machine code as NASM assembly, one instruction per line, followed by its data. It is generated each time it is shown and never saved; it is read-only and nothing builds from it. The gutter shows each line's address instead of a line number. Hover over an instruction for its address, its bytes and the Documentation of its mnemonic, and over a label for its address and where its name comes from. **Go to Definition** on a label goes to it, and **Go to References** lists every line that names it.

The data sections follow the code: strings as `s_Enter_password: db "Enter password: ", 0`, other bytes as `db` or `dq`, and uninitialized space as `resb`. An instruction that reads data through `[rel …]` names it, with the string as a comment, so searching the Listing for a message the program prints finds the code that uses it.

When execution is inside a shared library, after a crash, a Pause or a Step with **Step into library code** on, the editor shows that library's Listing, read-only, as `@lib/libc.so.6`. It is generated the first time it is needed, which takes about a second for libc. Listings as large as libc's and libstdc++'s are shown without syntax highlighting.

## Names in the Listing {#names}

The Listing uses the names the program carries and invents the rest:

- Symbols, from the symbol table or from the dynamic symbols a stripped program keeps: `main`, `_start`, `completed.0`. A symbol of an older version of a library's interface reads `stdin@GLIBC_2.2.5`.
- `name@plt`, the stub a call into a library goes through (`call strcmp@plt`), and `name@got`, the slot holding the library function's address.
- `main` in a stripped program, found from the address `_start` passes to `__libc_start_main`.
- `FUN_` and two words for any other function a `call` reaches (`FUN_brave_otter`), and `DAT_` and two words for other data the code uses.
- `.LAB_1`, `.LAB_2`… for the jump targets inside a function, numbered in address order, so a jump to a smaller number goes backwards, as a loop does. From another function the label reads `FUN_brave_otter.LAB_3`.
- `s_` and the text for a string: `s_Enter_password`.

The invented words say nothing about the code. They come from the address in the file, so a program gets the same names on every open and for everyone reading it, and notes that mention them stay right.

## Building and stepping {#stepping}

**Build** loads the program and runs its start, the dynamic linker included, up to `main`, or to the entry point when the Listing found no `main`. The Undo history starts there. A program that reads input or ends before `main` stops there, as a Run would.

**Step** over a call into a library, such as `call printf@plt`, runs the whole call and stops at the next instruction of the program, or earlier if the library calls back into the program (`qsort` calling its comparison function). The History shows the call as one row, "Called printf in libc.so.6". While the program waits for input inside a library, the editor shows the call that led there, such as `call fgets@plt`. To step through a library's instructions one at a time, turn on **Step into library code** in **Preferences**. In a static program the C library is part of the Executable, so Step enters its functions like the program's own.

A crash inside a library, such as overflowed data reaching `strlen`, is shown on the library's line, with the program's own frames in the **Call stack**; choosing a frame shows its line.

## Breakpoints {#breakpoints}

Click beside an instruction of the Listing to place a Breakpoint; a Run stops before that instruction. The Breakpoint holds the instruction's address, so it stays on the instruction when the Listing's lines move. Breakpoints go on the Executable's instructions only, not on a label, data or a library's Listing. To stop at a library call, place it on the `call` line, where the arguments are already in `rdi`, `rsi`, `rdx`, `rcx`, `r8` and `r9`: on `call strcmp@plt`, `rdi` and `rsi` hold the addresses of the two strings it compares.

## The Command line and Arguments {#arguments}

The Terminal's first line is the **Command line**, `$ ./crackme` followed by the program's **Arguments**, typed as in a shell: spaces separate words, quotes keep them together (`"two words"`) and a backslash escapes the next character. Nothing is expanded and no command runs. The program receives `argv[0]`, the Executable's path (`./crackme`), then the Arguments. They are a Setting of the project, also in the **Settings** panel, and take effect at the next Build: during a Debug session the line shows what that run started with. Assembled x86 programs receive them too, with `argv[0]` the Entry path without its extension (`./main` for `main.asm`), and compiled ones with the C or C++ File's path without its extension (`./main` for `main.c`). As on Linux, `argv` and the environment are copied to the top of the stack, so `argv[0]` and the Arguments decide where the stack starts: an assembled program's `rsp` starts at `0x7fffffffee10` when `argv[0]` has 3 to 10 characters, as `./main` does, 16 bytes lower from 11 characters and 32 lower from 27, with no Arguments. The memory view shows that block as the **Arguments and environment** region, above the stack, and names its parts: `argc`, the arrays `argv`, `envp` and `auxv`, each string (`argv[1]`, `envp[0]`) and what `AT_EXECFN` and `AT_RANDOM` point at.

## Testcases {#testcases}

A Testcase checks a solution without typing it, from its standard input (`hunter2`) and expected output (`Correct!`). In an x86 project it also has an **Arguments** field, read like the Command line, for a program that takes its input from `argv`. A Testcase whose field is empty runs with the project's Arguments, so it cannot ask for no Arguments while the project has some. A Testcase of an Executable starts at `main`, as a Build does: its starting registers and memory are set there, and its instruction limit counts from there.

## Patching an instruction {#patching}

While a Debug session is paused, you can replace an instruction of the Executable's Listing: put the cursor on its line and press **Space**, or choose **Patch instruction…** in the context menu (a long press on a touch screen). Type the new instruction with the Listing's names, such as `je .LAB_2`. The preview shows its bytes and how they decode before anything is written; **Enter** or **Patch** writes them. A shorter instruction is padded with `nop`s, and a longer one is refused because it would overwrite the next instruction. The patched line is marked and shows what memory now holds, and the History shows "Patched jne → je".

A patch changes memory only, like a value edited in the memory view: the Executable's File never changes, and the next Build starts from the original program. **Undo** takes a patch back like any other step, but Undo cannot go back past a step whose effects are not recorded, such as reading standard input or growing the heap. A patch made at `main` and followed by a Run that reads a password therefore stays until the next Build. To try a patch and take it back, make it after the program has read its input, for example at a Breakpoint on `call strcmp@plt`.

## Log notes {#log-notes}

The **Log** notes what a program met that the emulator does not provide, each once per run:

- A system call the emulator does not implement: "`getcpu` (syscall 309) is not implemented; the call returned ENOSYS". The program receives `ENOSYS`, as Linux answers an unknown call.
- An instruction the emulator cannot run, usually AVX or a later extension: "The program ran `vmovd xmm0, edi` at `0x555555555195`, which the emulator does not support". The program ends there with `SIGILL`; the Listing shows the instruction correctly.
- A library that is not bundled: "libcrypto.so.3 is not one of the bundled libraries".
- A Build whose program does not reach `main` within 50,000,000 instructions.

## Safety {#safety}

The program runs in an emulator inside the browser's sandbox, with no network and no files but the project's and the bundled libraries, so a challenge binary cannot reach your computer. It is a place to learn reverse engineering, not a malware lab: most malware targets Windows, needs the network and checks for emulation. A program cannot tell it is being debugged: Breakpoints are not written into its memory, and `ptrace(PTRACE_TRACEME)` succeeds as it does with no debugger attached. A timing check still sees real time, so stepping through one can trip it. A share link holds the project in its URL, which most Executables are too large for; download the project as an archive from the Projects page instead.
