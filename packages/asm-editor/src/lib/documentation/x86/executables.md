An **Executable** is a compiled x86-64 Linux **ELF** binary. You can import an Executable to inspect its disassembly, decompile its functions into C-like pseudocode, edit its bytes, and debug it step by step—without needing its original source code.

To open an Executable, click **Import** on the Projects page, or upload the ELF file in the **Explorer** of an existing x86 project and make it the **Entry** file. The editor detects ELF binaries from their header bytes, so filenames like `crackme` or `chall` need no extension.

An Executable opens with three views in the execution dock switch:

- **Disassemble** shows its assembly [Listing](#listing).
- **Decompile** shows C-like [Pseudocode](#decompile) alongside the Listing.
- **Hex** shows its raw bytes in the [Hex editor](#hex-editor).

Press **Debug** to load and run the binary.

## What runs {#what-runs}

The emulator runs 64-bit x86 Linux ELF executables:

- **Statically linked**: all library code is included inside the executable.
- **Dynamically linked**: the executable loads shared libraries at startup from the [bundled library list](#libraries).
- **Position-independent (PIE)** or **non-PIE**: PIE binaries load at `0x555555554000`; non-PIE binaries load at the fixed address in their ELF headers (usually `0x400000`). Shared libraries load below `0x7ffff7fff000`, and the stack starts below `0x7ffffffff000`.

32-bit x86 binaries, binaries for other architectures (such as ARM), unlinked object files (`.o`), and standalone shared libraries (`.so`) cannot be run as an Executable.

The program runs in `/project`, where it can open and read or write other Files in your project (such as `flag.txt`). Attempting to overwrite or delete the running Executable itself fails with `ETXTBSY` or `EBUSY`. The environment is single-threaded with no network access; calls that create threads, sockets, or child processes (`fork`) return an error. See [Program arguments](/documentation/x86/syscall#arguments) for the default environment variables.

## Shared libraries {#libraries}

Dynamically linked executables can use five bundled system libraries (from Ubuntu 26.04), downloaded automatically on first use:

| Library                | Version    | Purpose                                                  |
| ---------------------- | ---------- | -------------------------------------------------------- |
| `ld-linux-x86-64.so.2` | glibc 2.43 | Dynamic linker that loads libraries and resolves symbols |
| `libc.so.6`            | glibc 2.43 | Standard C library                                       |
| `libm.so.6`            | glibc 2.43 | Math library                                             |
| `libstdc++.so.6`       | GCC 16     | Standard C++ library                                     |
| `libgcc_s.so.1`        | GCC 16     | GCC runtime support (unwinding and exceptions)           |

If an executable requires another shared library (such as `libcrypto.so.3`) or a newer `GLIBC_2.xx` symbol version, it stops at startup and reports the missing dependency in the **Log** and **Terminal**.

These bundled Linux libraries are used only by imported Executables. Programs compiled from source inside the editor link against the lightweight [Runtime library](/documentation/x86/runtime-library) instead.

## The Hex editor {#hex-editor}

Switch to **Hex** in the dock to inspect the file's raw bytes. Each row shows the file offset, 16 hexadecimal bytes (8 on narrow screens), and the corresponding ASCII text (with non-printable bytes shown as `.`).

Use the switch in the execution dock to move between **Disassemble** ([Listing](#listing)), **Decompile** ([Pseudocode](#decompile)), and **Hex**. Starting **Debug** switches a single Hex pane to **Disassemble** so you can see the program counter, Breakpoints, and Patches (a pane on **Decompile** stays there); split the editor if you want to keep Hex and Disassemble visible side by side.

Other binary files in a project also open in the Hex editor. Media files and documents (images, PDFs, audio, video) open in **Preview** with a toggle to switch to **Hex**.

## Editing bytes {#byte-edits}

Click any byte in the Hex editor to place the caret:

- Type hexadecimal digits in the hex column or printable ASCII characters in the text column to overwrite bytes in place (files keep their byte length).
- Press **Tab** and **Shift+Tab** to switch between the hex and text columns.
- Use **Undo** (**Ctrl+Z**) and **Redo** (**Ctrl+Shift+Z** or **Ctrl+Y**) to step through your byte changes.

Changes made in the Hex editor overwrite the file's bytes: the Listing, the Pseudocode, **Debug**, **Download**, and project archives all use the edited bytes, while your [renames and comments](#annotations) remain intact. The **Edit history** panel in the side rail lists each run of typing, newest first; choose one to go back, or forward, to just after it. The history is kept in your browser beside the project, never in its archives or share links, and it is forgotten when something else changes the file, such as an upload or a program writing to it.

Files are read-only while a Debug session is active. To test a quick instruction change in memory while paused, [patch the instruction](#patching) in the Listing; to make a permanent change to the file, press **Stop**, right-click the line in the Listing, choose **Show in Hex**, and edit the bytes there.

## Parts of the ELF file {#elf-parts}

When viewing an Executable, the Hex editor color-codes the structure of the ELF file:

- **Code sections** (such as `.text`)
- **Data sections** (such as `.rodata` and `.data`)
- **Headers and symbol tables** (such as the ELF header, program/section headers, `.symtab`, and `.strtab`), or load segments (`load.2`, `load.3`, …) when section headers are stripped.

Hover over any byte (or check the status bar at the caret) to see which section it belongs to, its file offset range, and its runtime memory address range.

To jump between the Hex editor and the Listing:

- Right-click a byte inside a code section in the Hex editor and choose **Show in Listing** to jump to that instruction.
- Right-click an instruction or data line in the Listing and choose **Show in Hex** to select its bytes in the Hex editor.

## Finding bytes {#finding}

Use the toolbar above the Hex editor to search and navigate:

- **Find** (**Ctrl+F**): Search for **Hex** bytes or case-sensitive **Text**. In Hex mode, spaces are optional and `??` matches any byte (for example, `7f 45 ?? 46`). Typing non-hex characters switches to **Text** mode automatically. Press **Enter** / **Shift+Enter** to step through matches.
- **Go to** (**Ctrl+G**): Jump to a byte offset in hexadecimal (`0x1f40` or `1f40`) or decimal (`#8000`).
- **Selection and copying**: Hold **Shift** with the arrow keys or drag to select bytes. Use **Copy as hex** (`7f 45 4c 46`), **Copy as text**, or **Ctrl+C** (which copies in the format of the active column).

## The data inspector {#data-inspector}

Click **Inspector** above the Hex editor to decode the bytes starting at the caret as signed and unsigned integers (`int8` through `uint64`) and floating-point numbers (`float32` and `float64`). Toggle **Little** or **Big** to switch between little-endian (standard on x86) and big-endian byte order.

## The Listing {#listing}

**Disassemble** opens the Executable's **Listing**: a read-only view of its machine code in NASM syntax followed by its data sections (`db`, `dq`, `resb`). The Listing is generated on the fly from the file's current bytes. To modify the binary permanently, [edit its bytes](#byte-edits); to annotate the code, [rename symbols](#renaming) and add [comments](#comments).

Key features when reading the Listing:

- **Automatic comments**: Instructions that reference `[rel …]` data display the target label and string literal in a comment, making it easy to find where a message like `"Wrong!"` is used. In C++ binaries, calls and data references also show demangled [C++ names](#cpp-names) in comments.
- **Hovers**: Hover over an instruction for its encoding and documentation, over a label for its address and origin, or over a numeric constant for its decimal, hex, and binary values. If a constant's little-endian bytes form printable ASCII characters (such as `0x4c75257240343a41`), the hover also shows the decoded **Text** (`A:4@r%uL`).
- **Navigation**: Press **F12**, **Ctrl+click**, or double-click any label or call/jump target to **Go to Definition**. Right-click a label and choose **Go to References** to list every instruction or data item that refers to it.
- **Shared library Listings**: If execution pauses or crashes inside a shared library (or you step into one with **Step into library code** enabled), the editor opens a read-only Listing for that library (such as `@lib/libc.so.6`).

## Names in the Listing {#names}

When an Executable retains its symbol tables, the Listing uses those names; when symbols have been stripped, it generates deterministic names from file offsets so the same binary always shows the same labels:

| Name pattern        | Meaning                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------- |
| `main`, `_start`    | Symbols from `.symtab`/`.dynsym` (or `main` inferred from startup code in stripped binaries) |
| `stdin@GLIBC_2.2.5` | Dynamically linked symbol with its library version suffix                                    |
| `strcmp@plt`        | Procedure Linkage Table stub that forwards a `call` to a shared library function             |
| `strcmp@got`        | Global Offset Table slot holding the runtime address of a shared library symbol              |
| `FUN_brave_otter`   | Stripped function target reached by `call` (`FUN_` + two deterministic words)                |
| `DAT_misty_tanager` | Unnamed data address referenced by code (`DAT_` + two deterministic words)                   |
| `.LAB_1`, `.LAB_2`  | Local jump targets inside a function, numbered in address order (`func.LAB_1` from outside)  |
| `s_Enter_password`  | Null-terminated ASCII string in a data section (`s_` + leading characters)                   |

Once you figure out what a generated `FUN_` or `DAT_` symbol does, you can [rename](#renaming) it without affecting any other generated names. For C++ binaries, mangled symbols are paired with readable [C++ names](#cpp-names).

## C++ names {#cpp-names}

C++ compilers mangle namespaces, classes, and parameter types into symbol names such as `_ZNSolsEi`. The Listing keeps the mangled symbol in the instruction operand (so labels and [Patches](#patching) stay valid NASM identifiers) and displays the demangled C++ name in a comment:

```x86
    call _ZNSolsEi@plt                  ; std::ostream::operator<<(int)
    lea rdx, [rel _ZTVN4game4BossE+0x10] ; vtable for game::Boss+0x10
_ZTVN4game4BossE: db 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ; vtable for game::Boss
    dq _ZTIN4game4BossE                 ; typeinfo for game::Boss
    dq _ZN4game4BossD1Ev                ; game::Boss::~Boss()
    dq _ZN4game4BossD0Ev                ; game::Boss::~Boss() [deleting]
```

- **Readable standard-library types**: Verbose template types are shortened automatically—for example, `std::string` instead of `std::__cxx11::basic_string<char, …>` and `std::vector<std::string>` without default allocator arguments. Hover over the symbol in the Listing or Pseudocode to see the full demangled signature, short name, mangled name, and constructor/destructor variant (`[complete]`, `[base]`, or `[deleting]`).
- **Lists and navigation**: **Go to Symbol** (**Ctrl+Shift+O**), the [Symbols panel](#symbols), the **Call stack**, and the Pseudocode header display a function's short name (`std::vector<std::string>::push_back`), adding parameter types only when needed to distinguish overloaded functions.
- **Unmangled symbols**: Symbols that are not valid Itanium C++ mangled names (such as Rust `_R` symbols or symbols over 8,192 characters) remain as they are in the binary.

## The Symbols panel {#symbols}

Open the **Symbols** panel (the tags icon in the left rail) to browse all **Functions** and **Strings** in the current Executable:

- **Filter**: Type in the filter box to match symbol names, string contents, demangled C++ signatures, mangled names, or hexadecimal addresses.
- **Jump**: Click any row (or press **Enter** from the filter box) to jump the Listing—and any open [Pseudocode](#decompile) pane—to that function or string.
- **Annotate**: Press **F2** or right-click a function row (or tap **⋯** on touch screens) for **Rename…**, **Comment…**, and **Reset name**.

## Decompile {#decompile}

**Decompile** opens a **Pseudocode** pane beside the Listing, using Ghidra's decompiler to translate the current function's machine code into C-like code. Pseudocode is designed for reading and reverse engineering rather than recompiling.

- **Follows the Listing cursor**: The Pseudocode pane shows whichever function the Listing cursor is inside. Moving the cursor to another function in the Listing (or clicking a function in the Symbols panel) decompiles that function.
- **Linked lines**: Matching background colors connect each Pseudocode line to the assembly instructions that produced it. Selecting lines in either pane highlights the corresponding lines in the other. Function prologue/epilogue instructions like `endbr64` or `push rbp` that do not map to a C statement remain uncolored.
- **Local and live**: Decompilation runs locally in your browser from the Executable's current bytes. Edits in the Hex editor, [renames](#renaming), and [comments](#comments) automatically update the Pseudocode. Shared library Listings (`@lib/libc.so.6`) are not decompiled.

## Reading the Pseudocode {#pseudocode}

The Pseudocode header comment shows the function's name and address range (`// main, 0x5555555551e9 to 0x5555555552ba`), followed by your [function comment](#comments) if any.

Functions and global data share the same names as the [Listing](#names) (including any names you [renamed](#renaming)). Calls through PLT stubs (`strcmp@plt`) appear as direct calls (`strcmp(acStack_98, "hunter2")`), known C library functions use their standard parameter types, and C++ symbols are written with `::` namespace qualifiers.

For registers, stack slots, and types that are not recorded in the binary, Ghidra generates descriptive identifiers. Hover over any of these in the Pseudocode for a quick explanation:

| Identifier / Type             | Meaning in Pseudocode                                                                                                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `param_1`, `param_2`, …       | Function parameters by position (first six integer/pointer arguments arrive in `rdi`, `rsi`, `rdx`, `rcx`, `r8`, `r9`)                                                                                                         |
| `iVar1`, `pcVar2`, `uVar3`    | Local register/temporary variables: prefix letters indicate the inferred type (`i` = `int`, `pc` = `char *`, `u` = unsigned/unknown, `l` = `long`, `s` = `short`/`size_t`, `b` = `bool`/`byte`, `f` = `float`, `d` = `double`) |
| `local_10`, `acStack_98`      | Stack frame variables named by their hex byte offset below the entry stack pointer (`ac` = array of `char`)                                                                                                                    |
| `uStackX_8`, `stack0x...`     | Stack locations above the entry stack pointer (such as caller stack arguments) or raw stack addresses taken with `&`                                                                                                           |
| `undefined`, `undefined1`–`8` | 1 to 8 bytes whose exact type could not be inferred                                                                                                                                                                            |
| `code`, `code *`              | Machine code or a function pointer                                                                                                                                                                                             |
| `uRam00104010`, `_DAT_...`    | Unnamed global memory address, or a data access wider than the Listing label at that address                                                                                                                                   |
| `in_FS_OFFSET`                | Thread-local `FS` segment base (`in_FS_OFFSET + 0x28` is the stack canary checked before returning)                                                                                                                            |
| `in_RAX`, `in_stack_...`      | Register or stack location read before being written, outside the function's detected parameter list                                                                                                                           |
| `unaff_RBX`, `unaff_retaddr`  | Callee-saved register value or return address preserved from the caller                                                                                                                                                        |
| `extraout_RAX`                | Value left in a register by a called function whose prototype did not declare a return value                                                                                                                                   |
| `/* WARNING: ... */`          | Decompiler note about control flow or state it could not simplify completely                                                                                                                                                   |

### Navigating and inspecting in Pseudocode

- **Go to Definition**: Press **F12**, **Ctrl+click** (**⌘+click** on Mac), or double-click any function call or global variable to jump to it in the Listing (and switch the Pseudocode to that called function).
- **Number hovers**: Hover over any integer or character constant to see its decimal, hex, binary, and little-endian ASCII text representations.

## When decompiling takes long {#decompile-time}

Most functions decompile in a fraction of a second. Very large or complex functions (such as `printf_positional` inside a statically linked C library) can take longer and will stop after **30 seconds** with **No Pseudocode**. Click **Try again** to retry.

## Renames {#renaming}

You can rename any function, global data label, string label, local jump target (`.LAB_1`), or Pseudocode variable/parameter to make the code easier to follow.

### How to rename

1. Place the cursor on a symbol or variable in the Listing or Pseudocode (or select a function in the [Symbols panel](#symbols)).
2. Press **n** or **F2**, or right-click (long-press on touch screens) and choose **Rename…**.
3. Type the new name and press **Enter** (or click **Save**).

To restore the original name at any time, right-click the symbol or variable and choose **Reset name**.

### Naming rules and edge cases

- **Valid characters**: Names can use letters, digits, and `_` (up to 128 characters) and cannot start with a digit.
- **Reserved words**: A name cannot collide with an existing symbol or variable in scope, a C/C++ keyword, an x86 register (`rax`, `st`), a NASM operand keyword (`byte`, `qword`, `rel`), a C standard library type/constant (`size_t`, `FILE`, `NULL`), or a Ghidra auto-generated variable pattern (`iVar1`, `local_10`, `param_1`, `undefined8`).
- **Jump targets**: When renaming `.LAB_2`, enter the name without a leading dot (such as `retry`); the Listing formats it as `.retry` inside the function and `main.retry` from outside.
- **What cannot be renamed**: Shared library PLT/GOT imports (`strcmp@plt`), parameter names that come from built-in C library prototypes (like `s` in `puts(char *s)`), string literals or `goto` labels inside the Pseudocode, and symbols inside shared library Listings (`@lib/libc.so.6`).

## Comments {#comments}

You can attach notes to individual instructions/statements or to an entire function. Comments are shared between the Listing and the Pseudocode:

- Press **;** or right-click a line and choose **Comment…** to add or edit a comment at that instruction or statement.
- Choose **Function comment…** (or press **;** on the function's label/declaration line) to edit the comment at the top of the function.
- Inside the prompt, press **Enter** to save, **Shift+Enter** to insert a newline, or **Escape** to cancel. To remove a comment, click **Delete**, choose **Delete comment** in the context menu, or save an empty comment.

### How comments are displayed

- **In the Listing**: A short single-line comment (up to 60 characters) is placed at the end of the line after `;`. Multi-line or longer comments are wrapped above the line, and function comments appear directly above the function label.
- **In the Pseudocode**: Statement comments appear as `/* ... */` blocks above the statement that maps to that instruction's address, and function comments appear above the function prototype.
- **Unplaced comments**: If you comment on an instruction that has no corresponding statement in the Pseudocode (such as `endbr64` in the prologue or unreachable code), the Pseudocode lists it at the top of the function under `/* Comments that could not be placed in the function body: */` so your note is always visible.

## Keeping renames and comments {#annotations}

Renames and comments have their own undo history across the Listing, Pseudocode, and Symbols panel:

- Press **Ctrl+Z** (**⌘Z** on Mac) or choose **Undo rename or comment** in the context menu to undo your last annotation change.
- Press **Ctrl+Shift+Z** or **Ctrl+Y** (or **Redo rename or comment**) to redo it.

Annotations are saved with the Executable file in your project (including in project archives and share links) and survive [edits to its bytes](#byte-edits) and file renames. You can add or edit renames and comments whenever the program is stopped or paused at a breakpoint during a Debug session.

## Searching the Project {#search}

Press **Ctrl+Shift+F** (**⌘⇧F** on Mac) or click the magnifying glass in the left rail to open the **Search** panel.

- **Match options**: Toggle **Match case** (`Aa`, **Alt+C** / **⌥⌘C**), **Match whole word** (`ab`, **Alt+W** / **⌥⌘W**), or **Use regular expression** (`.*`, **Alt+R** / **⌥⌘R**).
- **File filters**: Click **⋯** to filter by comma-separated **Files to include** or **Files to exclude** glob patterns (such as `*.asm, src/**`).
- **Look in**: In projects with an Executable, choose which sources to search:
    - **Files**: All text files in the project (assembly, C/C++, headers, notes).
    - **Listings**: Every Executable's disassembled Listing, including your renames and comments.
    - **Pseudocode**: Decompiled functions across your Executables.

Click any match (or navigate with the arrow keys and press **Enter**) to open the file, Listing, or Pseudocode at that line.

## Searching the Pseudocode {#search-pseudocode}

When **Pseudocode** is enabled under **Look in**, the Search panel decompiles the Executable's functions in the background—starting with `main` (or the entry point), then the functions it calls, and then the rest in address order so application code is searched before statically linked library code.

- You can pause background decompilation at any time with **Cancel** and continue later with **Resume**.
- For Executables with more than 1,000 functions (such as large statically linked binaries), background decompilation waits until you enter a search query or click **Decompile now**.
- Background decompilation limits each function to **5 seconds** so one slow function does not block the rest; any skipped functions are listed with a **Try again** button.

## Back and forward {#navigation}

Every time you jump to a new location—via **Go to Definition**, **Go to Symbol**, **Show in Listing**, the [Symbols panel](#symbols), or [Search](#search) results—the editor records your previous position.

Press **Alt+←** and **Alt+→** (or use your mouse's back/forward buttons, or **Go Back** / **Go Forward** in the context menu) to move back and forward through your navigation history.

## Building and stepping {#stepping}

For an Executable, the Build button is labeled **Debug**. Clicking **Debug** loads the ELF file, runs dynamic linker and C runtime initialization, and pauses at the first instruction of `main` (or at the ELF entry point `_start` if `main` is not found).

- **Stepping over library calls**: By default, **Step** executes shared library calls (`call printf@plt`) as a single step and pauses as soon as execution returns to your program (including when a library function like `qsort` invokes a callback in your binary). Enable **Step into library code** in **Preferences** if you want **Step** to enter shared libraries.
- **Terminal input**: When the program waits for standard input (for example inside `fgets` or `scanf`), type your input in the highlighted **Terminal** and press **Enter**.
- **Stepping backward**: Use **Undo** in the execution dock to step backward through recorded program steps.
- **Startup limit**: If initialization runs for 50,000,000 instructions without reaching `main` (or hits a Breakpoint first), execution pauses at the current instruction so you can inspect or continue with **Run** and **Step**.

## Breakpoints {#breakpoints}

Click in the gutter beside any instruction in the Listing—or press **F9** / choose **Toggle Breakpoint** in the context menu—to set or remove a Breakpoint. **Run** pauses before executing that instruction.

- **Run to Cursor** (**Ctrl+F10**, **⌘F10** on Mac, or via the context menu): During a Debug session, runs the program until it reaches the instruction on the cursor's line, as if a Breakpoint were there for this Run only. It still stops earlier at any of your Breakpoints, and at the program's end. Run to Cursor from the line the program is stopped on runs until the program comes back to that instruction. It is offered only on the running program's own Listing and Pseudocode, while the program is stopped and not waiting for input.
- **Inspecting call arguments**: Place a Breakpoint on a `call` instruction (such as `call strcmp@plt`) to inspect the arguments passed to the function. Under the x86-64 System V ABI, the first six integer or pointer arguments are in `rdi`, `rsi`, `rdx`, `rcx`, `r8`, and `r9`.

## Debugging in the Pseudocode {#pseudocode-debugging}

While debugging, the Pseudocode pane tracks the active function and highlights the statement corresponding to the current instruction.

- **Setting Breakpoints**: Click in the Pseudocode gutter (or use **Toggle Breakpoint** / **Run to Cursor**) on any executable statement. This sets a Breakpoint on the first assembly instruction of each block that implements that statement—for example, setting a Breakpoint on `if (iVar1 == 0) {` places it on the `test eax, eax` instruction right after `strcmp` returns.
- Lines that do not generate instructions (variable declarations, braces, and comments) do not take Breakpoints.

## Addresses in registers and memory {#memory}

During a Debug session, the Memory view's address box accepts symbol names as well as hexadecimal addresses:

- Type any Listing label (`main`, `FUN_brave_otter`, `s_Enter_password`, `strcmp@plt`), a renamed symbol, a unique [C++ function or data name](#cpp-names), or a label with an offset (`DAT_misty_tanager+8`).

Right-click any register value in the Registers panel or any byte in the Memory view to follow addresses quickly:

- **Show in memory**: Jumps the Memory view to that address and highlights the target byte.
- **Show in Listing**: Jumps the Listing to the instruction at that address (if it lies within the Executable).
- **Follow pointer**: Reads the 8-byte little-endian pointer at the selected memory address and jumps the Memory view to the pointed-to address.
- **Copy as hex** / **Copy as decimal**: Copies the value to the clipboard.

Click **»** at the top right of the Memory view (or drag the splitter to the edge) to collapse the Registers and Memory column when you want more room for code.

## The Command line and Arguments {#arguments}

Enter command-line **Arguments** in the **Command line** bar at the top of the Terminal (or in **Settings**) before starting **Debug** or **Build**. See [Program arguments](/documentation/x86/syscall#arguments) for quoting rules and details.

The program receives `argc` and `argv`, where `argv[0]` is derived from the Entry file path and user arguments start at `argv[1]`:

| Program             | Source of `argv[0]`                                   | Example                 |
| ------------------- | ----------------------------------------------------- | ----------------------- |
| Imported Executable | `./` plus the Executable's Entry path                 | `crackme` → `./crackme` |
| Assembled x86       | `./` plus the Entry path without its final extension  | `main.asm` → `./main`   |
| Compiled C or C++   | `./` plus the source path without its final extension | `main.c` → `./main`     |

Because `argv`, `envp`, and the ELF auxiliary vector (`auxv`) are placed at the top of the stack at startup, the initial value of `rsp` depends on the length of the arguments. For an assembled program with no user arguments, the initial `rsp` values are:

| `argv[0]` byte length          | Initial `rsp`    |
| ------------------------------ | ---------------- |
| 3–10 bytes, including `./main` | `0x7fffffffee10` |
| 11–26 bytes                    | `0x7fffffffee00` |
| 27–42 bytes                    | `0x7fffffffedf0` |

## Testcases {#testcases}

In the **Testcases** panel, each Testcase can supply standard input, command-line **Arguments**, initial register/memory values, and expected output or register/memory checks. For an Executable, the emulator runs startup initialization to `main` (or the ELF entry point) before applying the Testcase's starting registers, memory, and instruction limit.

## Patching an instruction {#patching}

While a Debug session is paused, you can replace an instruction in memory to test how the program behaves (for example, flipping `jne` to `je` or replacing a check with `nop`):

1. Place the cursor on an instruction in the Listing and press **Space** (or right-click / long press on a touch screen and choose **Patch instruction…**).
2. Type the replacement NASM instruction (you can use any Listing label or renamed symbol, such as `je .LAB_2`).
3. Check the live byte preview and press **Enter** (or click **Patch**).

If the replacement instruction is shorter than the original, the remaining bytes are padded with `nop`. Replacements that encode to more bytes than the original instruction are rejected so they do not overwrite the following instruction.

**Patches modify memory only**: the next **Debug** / **Build** reloads the original file bytes. Debugger **Undo** can revert a patch as long as no irreversible step (such as reading from standard input) happened after the patch. To make a change permanent in the file, [edit its bytes](#byte-edits) in the Hex editor.

## The Build output {#build-output}

When you **Build** an x86 assembly or C/C++ program in the editor, the linked ELF executable is saved in the Explorer as the **Build output** (named after the Entry file without its extension, such as `main` for `main.asm`).

You can use the **Build output** just like an imported Executable:

- Open it in **Disassemble**, **Decompile**, or **Hex** to inspect the linked binary.
- Download it from the Explorer to run on a 64-bit Linux machine.
- Right-click it and choose **New program from this file** to debug the binary directly instead of stepping through your source file.

When you edit your source files, the Explorer marks the binary **From an earlier Build** and replaces it automatically on the next Build. If you edit the bytes of the Build output, or rename or comment on it, the next Build asks before overwriting your changes; to keep a separate copy that later Builds will not touch, rename it in the Explorer.

## Log notes {#log-notes}

The **Log** panel reports environment or instruction issues encountered during a run:

- **Unimplemented syscalls**: The call returns `-ENOSYS` to the program and logs the syscall name and number once per run.
- **Unsupported instructions**: Legacy non-`v` SSE4/AES instructions or unsupported extensions (such as AVX-512) stop execution with `SIGILL` and log the instruction and address. See [Vector instructions](/documentation/x86/vector-instructions) for supported extensions.
- **Missing shared libraries**: Logs any dynamic library required by the ELF header that is not in the [bundled list](#libraries).
- **Startup instruction limit**: Warns if startup initialization exceeds 50,000,000 instructions before reaching `main`.

## Safety {#safety}

Executables run entirely inside your browser's WebAssembly sandbox, and both the Listing and Ghidra Pseudocode are generated locally on your device—binaries are never uploaded to a server.

The emulated process can access only the files inside the project workspace and has no network access. Breakpoints are managed by the emulator without writing `int3` (`0xcc`) into guest memory, and `ptrace(PTRACE_TRACEME)` succeeds as if no debugger were attached. Note that system calls that read the clock observe real elapsed time while paused.

Because share links encode the project in the URL, projects containing large Executables should be shared by downloading a project archive from the Projects page instead.
