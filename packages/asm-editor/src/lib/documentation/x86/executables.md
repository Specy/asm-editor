An **Executable** is a program compiled and linked outside the editor. Build loads its machine code directly, so you can inspect and debug it even when you do not have its source. The supported file format is **ELF**, the format Linux uses for executable programs and libraries.

Use **Import** on the Projects page to create an x86 project with the ELF file as its **Entry** file. In an existing x86 project, upload it in the **Explorer** and accept the offer to make it the Entry file. The editor recognises the file from its first bytes, so names such as `crackme` or `chall` work without an extension. The Executable opens in the [Hex editor](#hex-editor), and **Disassemble** shows it as assembly.

## What runs {#what-runs}

The editor accepts x86-64 Linux ELF executables with these forms of linking and loading:

- **Statically linked:** the executable carries the library code it needs.
- **Dynamically linked:** the executable loads code from separate shared-library files, subject to the [bundled library list](#libraries).
- **Position-independent (PIE)** or non-PIE: a PIE can be loaded at a different base address; a non-PIE normally specifies its addresses in the file.

A 32-bit x86 program, a program for another processor such as ARM, an **object file** (code that still needs to be linked into a program), or a **shared library** (code another program loads) is refused as an Executable. The editor reports the reason. If uploaded into an existing project, the refused file remains as an ordinary File.

Programs run with a Linux-style terminal and predictable load addresses: a PIE starts at `0x555555554000`; a non-PIE uses the addresses in its ELF headers, usually `0x400000`. Shared libraries are placed just below `0x7ffff7fff000`, and the stack is below `0x7ffffffff000`.

The working directory is `/project`, which contains the project's Files: a program can open a neighbouring `flag.txt` by that name. It can read its own Executable File, but writing it fails with `ETXTBSY`, as on Linux. Deleting or renaming that File fails with `EBUSY`; Linux allows those operations, but the simulator keeps the Entry file in the project. The program receives the [fixed x86 environment](/documentation/x86/syscall#arguments). It has one thread and no network; attempts to create threads, sockets, or a child process with `fork` fail.

## Shared libraries {#libraries}

Dynamically linked programs use five bundled libraries from Ubuntu 26.04. The editor downloads a library only when a program needs it:

| Library                | Version    | Purpose                                                                         |
| ---------------------- | ---------- | ------------------------------------------------------------------------------- |
| `ld-linux-x86-64.so.2` | glibc 2.43 | The dynamic linker, which loads libraries and connects calls to their functions |
| `libc.so.6`            | glibc 2.43 | The C library                                                                   |
| `libm.so.6`            | glibc 2.43 | Mathematical functions                                                          |
| `libstdc++.so.6`       | GCC 16     | The C++ standard library                                                        |
| `libgcc_s.so.1`        | GCC 16     | Compiler support used by C++ programs                                           |

A program that needs another library, such as `libcrypto.so.3`, does not start. The **Log** names the missing library, and the Terminal shows the dynamic linker's error. A program requiring a newer glibc version also stops, with an error such as `version 'GLIBC_2.xx' not found`.

These Linux libraries are separate from the editor's [Runtime library](/documentation/x86/runtime-library). That reference describes programs compiled in the editor and assembly programs that explicitly link the Runtime library; its function list and C++ restrictions do not describe the libraries used by an imported Executable. Conversely, compiling in the editor does not give a program the bundled glibc or C++ standard library. A statically linked Executable uses the library code already inside its file.

## The Hex editor {#hex-editor}

An Executable opens in the **Hex editor**, which shows the File's bytes. Each row starts with its offset in the File, followed by 16 bytes in hexadecimal and the same bytes as text, where a byte outside printable ASCII shows as `.`. On a narrow screen, a row holds 8 bytes.

The switch in the execution dock chooses what the pane shows: **Hex** for the bytes, **Disassemble** for the [Listing](#listing). The project remembers the view you last chose for each File. **Build** moves a pane showing the Executable in Hex to Disassemble, because the program counter, Breakpoints and Patches are shown on the Listing. During the Debug session you can switch back to Hex to read the File's bytes, but the next Step returns a single pane to Disassemble; split the editor to keep both in sight. Stop leaves each pane on its view.

Other Files stored as bytes open in the Hex editor too. An image, a PDF, audio or video opens in **Preview**, which shows it as the browser does, with **Preview** and **Hex** in the switch; if the browser cannot show it, the File opens in Hex with a note saying so. The editor recognises these kinds from their first bytes, not their names.

## Editing bytes {#byte-edits}

Click a byte, or tap it on a touch screen, to place the caret. Typing a hexadecimal digit in the hex column replaces half a byte and moves on; typing a printable ASCII character in the text column replaces the whole byte. **Tab** moves the caret to the text column and **Shift+Tab** back. Typing only overwrites: a File keeps its length, and you cannot insert or delete bytes.

These changes are **Byte edits**. The project saves them with the File and keeps the File's original bytes apart from them; the status line shows **edited** while a File has some. Everything that reads the File uses the edited bytes: Build, the Listing, a program that opens the File, and **Download exact bytes** in the Explorer. A project archive and a share link carry both the original bytes and the Byte edits. Uploading a File over it, or a program writing to it during a run, replaces its bytes and discards its Byte edits. **Undo** (Ctrl+Z) and **Redo** (Ctrl+Shift+Z or Ctrl+Y) in the Hex editor go back and forward through the edits you made to the File since you opened the project.

For example, to change the message `Wrong!`, [find](#finding) it as text and type over its letters in the text column. Disassemble then shows the new text in the Listing's data and in the comment beside each instruction that reads it.

During a Debug session, the Files are read-only, so the Hex editor takes no typing until you Stop. Over an Executable, it notes "The File's bytes. Patches and the program's writes are in memory: see the memory view." A [Patch](#patching) changes the running program's memory, never the File, and is gone at the next Build. To keep one, note the bytes its preview shows, Stop, choose **Show in Hex** on its line, and type them.

## Parts of the ELF file {#elf-parts}

For an Executable, the Hex editor tints the parts of the ELF file as the memory view tints its regions: the ELF header, the program header table, the section header table, and each section with bytes in the file. Code sections such as `.text` share one tint, data sections such as `.rodata` and `.data` another, and the ELF's own headers and tables, such as `.symtab` and `.strtab`, a third. Hover over a byte for its part's name, its offsets in the File and the addresses the program has it at when it runs, such as `.text · offset 0x1100–0x12ba · address 0x555555555100–0x5555555552ba`. The status line names the part the caret is in, so a touch screen shows it too. A program without section headers is tinted by its load segments instead, named `load.2`, `load.3`, … as in the Listing.

**Show in Listing**, in the Hex editor's context menu (a long press on a touch screen), goes from a byte of a code section to its instruction in the Listing. The pane switches to Disassemble, unless the other pane shows the Listing already. **Show in Hex**, in a Listing line's context menu, selects that line's bytes in the Hex editor, for an instruction or a line of data.

## Finding bytes {#finding}

The buttons above the bytes open **Find**, **Go to** and the [data inspector](#data-inspector).

**Find** (Ctrl+F) looks for hexadecimal bytes or for text. Hex bytes can be written with or without spaces, and `??` matches any byte, as in `7f 45 ?? 46`. Text is matched exactly, letter case included. **Enter** goes to the next match and **Shift+Enter** to the previous one, wrapping at the end of the File. Selected bytes, up to 64 of them, fill the search box.

**Go to** (Ctrl+G) moves the caret to an offset, written in hexadecimal with or without `0x` (`1f40`, `0x1f40`) or in decimal after `#` (`#8000`).

To select bytes, hold **Shift** with the arrow keys, or drag across them. **Copy as hex** in the context menu copies them as `7f 45 4c 46`, and **Copy as text** copies them as the text column shows them. **Ctrl+C** copies in the form of the column the caret is in.

## The data inspector {#data-inspector}

The data inspector reads the bytes at the caret as numbers: signed and unsigned 8, 16, 32 and 64-bit integers, from `int8` to `uint64`, and single and double precision floating-point numbers, `float32` and `float64`. **Little** and **Big** choose the byte order: little-endian, the order x86 uses, puts the least significant byte first. A reading that needs more bytes than remain in the File shows no value.

The **Inspector** button above the bytes shows or hides it. In a wide pane it sits beside the bytes; otherwise it sits below them.

## The Listing {#listing}

**Disassemble** shows an Executable's **Listing**: its machine code as NASM assembly, one instruction per line, followed by its data. The Listing is generated from the File's current bytes when shown and is never saved. It is read-only; to change the program, [edit its bytes](#byte-edits) in the Hex editor. The gutter shows an address for each line. Hover over an instruction for its address, bytes, and mnemonic documentation, or over a label for its address and the source of its name. **Go to Definition** on a label opens its location; **Go to References** lists the lines that name it.

Data sections follow the code: strings appear as `s_Enter_password: db "Enter password: ", 0`, other bytes as `db` or `dq`, and uninitialized space as `resb`. An instruction that reads data through `[rel …]` names the data, with the string as a comment. Searching for a printed message can therefore help you find instructions that use it.

If execution stops inside a shared library after a crash, a **Pause**, or a **Step** with **Step into library code** enabled, the editor opens that library's read-only Listing, such as `@lib/libc.so.6`. It is generated on first use, which takes about a second for libc. Large Listings, including libc's and libstdc++'s, are shown without syntax highlighting.

## Names in the Listing {#names}

A **symbol** is a saved name for a function or data address. **Stripping** a program removes many of these names, usually to reduce the file size. The Listing uses available names and assigns names where they are missing:

- Saved symbols from the program's symbol table or its dynamic symbols, which identify names needed for dynamic linking even in a stripped program: `main`, `_start`, `completed.0`. A versioned library symbol can appear as `stdin@GLIBC_2.2.5`.
- `name@plt` for the short sequence that forwards a call to a library function, as in `call strcmp@plt`; `name@got` for the memory slot holding that function's address.
- An inferred `main` when startup code reveals its address even though the saved name was stripped. The hover identifies this as an inferred name.
- `FUN_` followed by two words for other function addresses reached by `call`, such as `FUN_brave_otter`; `DAT_` followed by two words for other data used by the code.
- `.LAB_1`, `.LAB_2`, … for jump targets inside a function, numbered in address order. A jump to a smaller number goes backwards, as a loop does. From another function, the name includes its function: `FUN_brave_otter.LAB_3`.
- `s_` followed by text for a string, such as `s_Enter_password`.

The invented words do not describe what the code does. They depend on its address in the file, so the same program gets the same names on every open and for every reader. You can use those names in shared notes.

## Building and stepping {#stepping}

**Build** loads the Executable and runs its startup code, including the dynamic linker, toward the first instruction of detected `main`. When no `main` is found, the target is the executable entry point: the address recorded in the ELF file where program execution starts. This startup advance happens even when **Step into library code** is enabled.

Startup can stop earlier at one of your Breakpoints or when you press **Pause**. If the program asks for Terminal input, type an answer and press **Enter**; startup continues toward the target after receiving it. If the program exits or encounters an error first, the editor shows where it stopped. After 50,000,000 startup instructions without reaching the target, execution pauses at the current instruction and the **Log** shows a warning. The loaded program remains available for inspection; use **Run** or **Step** to continue.

Instructions executed during Build's startup advance are outside Undo history. New steps are recorded from the point where Build stops.

By default, **Step** over a shared-library call such as `call printf@plt` runs the call and stops at the next program instruction. It stops earlier if the library calls back into your program, as when `qsort` calls your comparison function. History groups the library call into one row, such as "Called printf in libc.so.6". While it waits for input, the editor shows the call that led there, such as `call fgets@plt`.

To step through shared-library instructions, enable **Step into library code** in **Preferences**. For a statically linked Executable, the library code is already part of the Executable, so Step enters those functions like other program functions. Programs [compiled in the editor](/documentation/x86/runtime-library#stepping) use different startup handling: enabling this Preference begins their execution at `_start`.

A crash inside a library, such as invalid data reaching `strlen`, is shown on that library's instruction. The **Call stack** includes the program's own frames; choose a frame to see its line.

## Breakpoints {#breakpoints}

Click beside a Listing instruction to place a Breakpoint. **Run** stops before that instruction. A Breakpoint holds its address, so it stays on the instruction if the Listing's lines move. You can set Breakpoints on the Executable's instructions, but not on labels, data, or a library's Listing.

To inspect the inputs to a library function, stop on its `call` instruction. Integer and pointer arguments in the x86-64 function calling convention use `rdi`, `rsi`, `rdx`, `rcx`, `r8`, and `r9`. For example, at `call strcmp@plt`, `rdi` and `rsi` hold the addresses of the strings to compare.

## The Command line and Arguments {#arguments}

Supply **Arguments** on the Terminal's first line, the **Command line**, or in the project's **Settings** panel. They take effect at the next Build and are separate from text a running program reads from the Terminal. During a Debug session, the Command line shows the arguments used by that run. Stop the session to edit it.

The program receives `argc`, a count, and `argv`, an array of pointers to argument strings. `argv[0]` is the program's name; the Arguments you entered begin at `argv[1]`. The [x86 Program arguments reference](/documentation/x86/syscall#arguments) gives quoting rules, limits, the assembly entry-point layout, and the C/C++ `main` signature. The program name depends on the Entry file:

| Program             | Source of `argv[0]`                                   | Example                 |
| ------------------- | ----------------------------------------------------- | ----------------------- |
| Imported Executable | `./` plus the Executable's Entry path                 | `crackme` → `./crackme` |
| Assembled x86       | `./` plus the Entry path without its final extension  | `main.asm` → `./main`   |
| Compiled C or C++   | `./` plus the source path without its final extension | `main.c` → `./main`     |

For an assembled or compiled program, that name is also the path of the [Build output](#build-output), the program the Build linked.

Arguments and other startup data occupy the upper part of the stack. Their sizes affect the initial `rsp`, so use its actual starting value rather than assuming a universal stack address. For an assembled program with no Arguments, these are the initial values for the following UTF-8 byte lengths of `argv[0]`, excluding its terminating NUL:

| `argv[0]` byte length          | Initial `rsp`    |
| ------------------------------ | ---------------- |
| 3–10 bytes, including `./main` | `0x7fffffffee10` |
| 11–26 bytes                    | `0x7fffffffee00` |
| 27–42 bytes                    | `0x7fffffffedf0` |

The memory view labels the startup block **Arguments and environment**. `argc` is the count; `argv` is the argument-pointer array; `envp` is the pointer array for environment strings such as `HOME=/project`. Each pointer array ends in a null pointer. `auxv`, the **auxiliary vector**, holds loader-supplied pairs of a type and a value. Its `AT_EXECFN` entry points to a copy of the executable path, and `AT_RANDOM` points to 16 random bytes used by library startup. The view also labels individual strings such as `argv[1]` and `envp[0]`.

## Testcases {#testcases}

A Testcase supplies standard input, such as `hunter2`, and checks expected output, such as `Correct!`. Its **Arguments** field supplies startup arguments with the same quoting rules as the Command line. An empty or whitespace-only field inherits the project's Arguments; it cannot request an empty argument list while project Arguments are set.

For an Executable, startup advances to detected `main`, or to the executable entry point if no `main` is found. The Testcase's starting registers and memory are applied there, and its configured instruction limit counts from that point. Startup has its own 50,000,000-instruction budget; a Testcase that exceeds it fails.

## Patching an instruction {#patching}

While a Debug session is paused, you can replace an instruction in the Executable's Listing. Put the cursor on its line and press **Space**, or choose **Patch instruction…** in its context menu (a long press on a touch screen). Enter the replacement using the Listing's names, such as `je .LAB_2`. The preview shows its bytes and decoded instructions before writing anything; **Enter** or **Patch** applies it. A shorter replacement is padded with `nop`s. A longer replacement is refused because it would overwrite the next instruction. The patched line is marked and shows the current memory contents; History shows a row such as "Patched jne → je".

A patch changes memory only. The Executable File keeps its bytes, and the next Build reloads them; to change the File itself, make a [Byte edit](#byte-edits). **Undo** can reverse a patch, but cannot cross a step with effects that are not recorded, such as consuming standard input or growing the heap. If you patch at `main` and then Run until the program reads a password, Undo cannot reach that patch; it remains until the next Build. To try a patch that you can undo, apply it after the program reads input, for example at a Breakpoint on `call strcmp@plt`.

## The Build output {#build-output}

When **Build** assembles your program, including one compiled from C or C++, it links a Linux executable, as `nasm` and `ld` would. The **Explorer** lists it under **Build output**, at the name the [Command line](#arguments) runs it as: the Entry path without its extension, so `main.asm` gives `main` and a program compiled from `src/main.c` gives `src/main`. It opens like an imported Executable, in Hex and Disassemble, and it is read-only. Its Listing takes no Breakpoints; the debugger follows the program in your source.

The running program finds it in its working directory: it can open `./main` and read its bytes, but writing it fails with `ETXTBSY`, and renaming or deleting it fails with `EBUSY`. Each Testcase's program finds its own copy.

Each Build replaces the Build output, and it is never saved with the project, archived or shared. Once you change a File it was built from, the Entry file, or a project Setting the Build uses, the Explorer dims it and marks it **From an earlier Build** until the next Build. **Download** saves it to run on an x86-64 Linux machine. **Keep as File** copies it into the project as an Executable under a name you choose, which no File may have already.

If a File or folder of the project already has the Build output's path, the Build output is not shown, and the **Log** says so: "`main` is already a File of the Project, so the built program is not shown; rename one of them." An Executable Entry has no Build output, since it is a File of the project already.

## Log notes {#log-notes}

The **Log** reports unsupported operations once per run:

- An unimplemented system call: "`getcpu` (syscall 309) is not implemented; the call returned ENOSYS". The program receives `ENOSYS`, Linux's error for an unavailable call.
- An unsupported instruction, often AVX or a later extension: "The program ran `vmovd xmm0, edi` at `0x555555555195`, which the emulator does not support". Execution ends with `SIGILL`, the illegal-instruction signal. The Listing still decodes the instruction.
- A library that is not bundled: "libcrypto.so.3 is not one of the bundled libraries".
- Startup that reaches the 50,000,000-instruction budget. Execution pauses and remains inspectable, as described under [Building and stepping](#stepping).

## Safety {#safety}

The program runs in an emulator inside the browser's sandbox. Its file access is limited to project Files and bundled libraries, and it has no network access. Breakpoints do not modify program bytes, and `ptrace(PTRACE_TRACEME)` succeeds as it does when no debugger is attached. Timing checks still see real time, so pausing or stepping can change their results.

A share link stores the project in its URL, which most Executables are too large for. Download the project as an archive from the Projects page to share it instead.
