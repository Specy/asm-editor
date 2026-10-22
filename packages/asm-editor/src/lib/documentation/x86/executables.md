An **Executable** is a program compiled and linked outside the editor. **Debug** loads its machine code directly, so you can inspect and debug it even when you do not have its source. The supported file format is **ELF**, the format Linux uses for executable programs and libraries.

Use **Import** on the Projects page to create an x86 project with the ELF file as its **Entry** file. In an existing x86 project, upload it in the **Explorer** and accept the offer to make it the Entry file. The editor recognises the file from its first bytes, so names such as `crackme` or `chall` work without an extension. The Executable opens on **Disassemble**, which shows it as assembly in its [Listing](#listing), at `main`. **Hex** shows its bytes in the [Hex editor](#hex-editor), and **Decompile** shows it as C-like [Pseudocode](#decompile).

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

The first Build that needs a library downloads it, and later Builds reuse it. While it downloads, Build names it, as in **Downloading libc.so.6…**. A download that fails, or receives nothing for 20 seconds, ends the Build: the Terminal, the Log and a message say what could not be downloaded, such as "Could not download libc.so.6: no data for 20 s. Check the connection and Build again.", and **Build** is available again. When the server refuses the download instead, with an error such as `404 Not Found`, the site has most likely been updated since the page was opened, and the message says to reload the page and Build again.

These Linux libraries are separate from the editor's [Runtime library](/documentation/x86/runtime-library). That reference describes programs compiled in the editor and assembly programs that explicitly link the Runtime library; its function list and C++ restrictions do not describe the libraries used by an imported Executable. Conversely, compiling in the editor does not give a program the bundled glibc or C++ standard library. A statically linked Executable uses the library code already inside its file.

## The Hex editor {#hex-editor}

The **Hex editor** shows the File's bytes. Each row starts with its offset in the File, followed by 16 bytes in hexadecimal and the same bytes as text, where a byte outside printable ASCII shows as `.`. On a narrow screen, a row holds 8 bytes.

The switch in the execution dock chooses what the pane shows: **Hex** for the bytes, **Disassemble** for the [Listing](#listing), **Decompile** for the [Pseudocode](#decompile). An Executable opens on Disassemble unless you chose another view for it, which the project remembers. **Debug** moves a pane showing the Executable in Hex to Disassemble, because the program counter, Breakpoints and Patches are shown on the Listing; a pane on Decompile stays there. During the Debug session you can switch back to Hex to read the File's bytes, but the next Step returns a single pane to Disassemble; split the editor to keep both in sight. Stop leaves each pane on its view.

Other Files stored as bytes open in the Hex editor. An image, a PDF, audio or video opens in **Preview**, which shows it as the browser does, with **Preview** and **Hex** in the switch; if the browser cannot show it, the File opens in Hex with a note saying so. The editor recognises these kinds from their first bytes, not their names.

## Editing bytes {#byte-edits}

Click a byte, or tap it on a touch screen, to place the caret. Typing a hexadecimal digit in the hex column replaces half a byte and moves on; typing a printable ASCII character in the text column replaces the whole byte. **Tab** moves the caret to the text column and **Shift+Tab** back. Typing only overwrites: a File keeps its length, and you cannot insert or delete bytes.

These changes are **Byte edits**. The project saves them with the File and keeps the File's original bytes apart from them; the status line shows **edited** while a File has some. Everything that reads the File uses the edited bytes: Build, the Listing, a program that opens the File, and **Download exact bytes** in the Explorer. A project archive and a share link carry both the original bytes and the Byte edits. Uploading a File over it, or a program writing to it during a run, replaces its bytes and discards its Byte edits. **Undo** (Ctrl+Z) and **Redo** (Ctrl+Shift+Z or Ctrl+Y) in the Hex editor go back and forward through the edits you made to the File since you opened the project.

For example, to change the message `Wrong!`, [find](#finding) it as text and type over its letters in the text column. Disassemble then shows the new text in the Listing's data and in the comment beside each instruction that reads it.

During a Debug session, the Files are read-only, so the Hex editor takes no typing until you Stop. The **Hex** button's tooltip explains that it shows the File's bytes; changes made while debugging appear in the Memory view. A [Patch](#patching) changes the running program's memory, never the File, and is gone at the next Build. To keep one, note the bytes its preview shows, Stop, choose **Show in Hex** on its line, and type them.

## Parts of the ELF file {#elf-parts}

For an Executable, the Hex editor tints the parts of the ELF file as the memory view tints its regions: the ELF header, the program header table, the section header table, and each section with bytes in the file. Code sections such as `.text` share one tint, data sections such as `.rodata` and `.data` another, and the ELF's own headers and tables, such as `.symtab` and `.strtab`, a third. Hover over a byte for its part's name, its offsets in the File and the addresses the program has it at when it runs, such as `.text · offset 0x1100–0x12ba · address 0x555555555100–0x5555555552ba`. The card hides while you drag across bytes, open the context menu or Find, or press a key, and comes back when the pointer moves. The status line names the part the caret is in, so a touch screen shows it too. A program without section headers is tinted by its load segments instead, named `load.2`, `load.3`, … as in the Listing.

**Show in Listing**, in the Hex editor's context menu (a long press on a touch screen), goes from a byte of a code section to its instruction in the Listing. The pane switches to Disassemble, unless the other pane shows the Listing already. **Show in Hex**, in a Listing line's context menu, selects that line's bytes in the Hex editor, for an instruction or a line of data.

## Finding bytes {#finding}

The buttons above the bytes open **Find**, **Go to** and the [data inspector](#data-inspector).

**Find** (Ctrl+F) looks for hexadecimal bytes or for text. Hex bytes can be written with or without spaces, and `??` matches any byte, as in `7f 45 ?? 46`. Text is matched exactly, letter case included. Find starts on **Hex**, and typing anything other than hexadecimal digits, spaces, commas and `?` switches it to **Text**, so `Wrong!` and `0x7f` are looked for as text. A word made only of hexadecimal digits, such as `cafe`, is looked for as bytes until you choose **Text**. **Enter** goes to the next match and **Shift+Enter** to the previous one, wrapping at the end of the File. Selected bytes, up to 64 of them, fill the search box.

**Go to** (Ctrl+G) moves the caret to an offset, written in hexadecimal with or without `0x` (`1f40`, `0x1f40`) or in decimal after `#` (`#8000`).

To select bytes, hold **Shift** with the arrow keys, or drag across them. **Copy as hex** in the context menu copies them as `7f 45 4c 46`, and **Copy as text** copies them as the text column shows them. **Ctrl+C** copies in the form of the column the caret is in.

## The data inspector {#data-inspector}

The data inspector reads the bytes at the caret as numbers: signed and unsigned 8, 16, 32 and 64-bit integers, from `int8` to `uint64`, and single and double precision floating-point numbers, `float32` and `float64`. **Little** and **Big** choose the byte order: little-endian, the order x86 uses, puts the least significant byte first. A reading that needs more bytes than remain in the File shows no value.

The **Inspector** button above the bytes shows or hides it. In a wide pane it sits beside the bytes; otherwise it sits below them.

## The Listing {#listing}

**Disassemble** shows an Executable's **Listing**: its machine code as NASM assembly, one instruction per line, followed by its data. The Listing is generated from the File's current bytes when shown and is never saved. It is read-only, as the notice at the top right says; to change the program, [edit its bytes](#byte-edits) in the Hex editor. The notice's **?** opens this section in the Documentation panel, and the notice hides while Find (Ctrl+F) is open in the pane. The gutter shows an address for each line. The Listing opens with `main`, or the entry point when no `main` is found, near the top, and beside a Pseudocode at its function. Switching the pane to Hex and back returns to the same place.

Data sections follow the code: strings appear as `s_Enter_password: db "Enter password: ", 0`, other bytes as `db` or `dq`, and uninitialized space as `resb`. An instruction that reads data through `[rel …]` names the data, with the string as a comment. Searching for a printed message can therefore help you find instructions that use it. In a C++ program, a comment also gives the readable [C++ name](#cpp-names) of each function or data a line names.

Hover over an instruction for its address, bytes, and mnemonic documentation, or over a label for its address and the source of its name; a C++ name's hover also gives its [other forms](#cpp-names). Hover over a number for its value in decimal, hexadecimal and binary. When the number's bytes, in the order x86 keeps them in memory, are at least two printable characters, the card adds a **Text** line: `0x4c75257240343a41` reads `A:4@r%uL`, as a string the program builds from it does.

**Go to Definition** (F12, or Ctrl+click) on a label opens its location, and so does a double-click on a label or on the target of a call or jump; such a name is underlined while the pointer is over it. **Go to References** lists the lines that name it. [Back and forward](#navigation) returns to where you were.

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

A C++ program's saved names are mangled, such as `_ZNSolsEi@plt` for `std::ostream::operator<<(int)`. The Listing keeps them as they are and shows the [C++ names](#cpp-names) in comments, hovers and lists.

## C++ names {#cpp-names}

A C++ compiler encodes a function's namespaces, class and parameter types in its symbol name: `std::ostream::operator<<(int)` is `_ZNSolsEi` in the file. This encoding is called **mangling**. The editor demangles the names of an Executable, of a [Build output](#build-output) and of the libraries they load, such as `@lib/libstdc++.so.6`.

The Listing's text keeps the mangled names, which its operands, labels, Go to Definition, References and [Patches](#patching) use. A comment gives the C++ name beside a call or jump target, an operand that names data, a `dq` pointer and a label's own line:

```x86
    call _ZNSolsEi@plt                  ; std::ostream::operator<<(int)
    lea rdx, [rel _ZTVN4game4BossE+0x10] ; vtable for game::Boss+0x10
_ZTVN4game4BossE: db 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ; vtable for game::Boss
    dq _ZTIN4game4BossE                 ; typeinfo for game::Boss
    dq _ZN4game4BossD1Ev                ; game::Boss::~Boss()
    dq _ZN4game4BossD0Ev                ; game::Boss::~Boss() [deleting]
```

**Find** (Ctrl+F) therefore finds a function by its C++ name, at its label and at each call. A comment's words are not names: double-clicking `main` in `; main::'lambda'(int)::operator()(int) const` goes nowhere, and the mangled name before the comment is the one to follow. A comment longer than 100 characters gives the name and `(…)` instead of the parameters. `[deleting]` marks a deleting destructor, which also frees the object; a vtable lists it beside the complete destructor, which otherwise reads the same. The rarer allocating and inheriting constructors are marked `[allocating]` and `[inheriting]`.

The standard library's long template names are shortened: `std::string` stands for `std::__cxx11::basic_string<char, std::char_traits<char>, std::allocator<char>>` and `std::ostream` for `std::basic_ostream<char, std::char_traits<char>>`, and template arguments that are the defaults are left out, as in `std::vector<std::string>` and `std::map<std::string, int>`. Other templates read as the demangler writes them. libstdc++ contains an older string type beside the current one, and both read `std::string`; the address and the hover tell them apart.

Hover over a C++ name in the Listing for its signature and address, then the demangler's exact text when the signature shortens it, its short name and its mangled name. For a constructor or destructor, the hover also says which variant the mangled name marks, such as "`D0` marks the deleting destructor". Then it says where the name comes from, as for any label.

Lists show a function's **short name**, without its parameters: `std::vector<std::string>::push_back`. Where two functions share a short name, as overloads do, each shows its signature, such as `sum(std::vector<int> const&)` and `sum(std::vector<std::string> const&)`; where the signatures match too, the variant follows, `[complete]` or `[base]`. **Go to Symbol** (Ctrl+Shift+O), the [Symbols panel](#symbols) and the Pseudocode's first line name functions this way. Go to Symbol finds a function only by the name it shows; the Symbols panel's filter also finds it by its mangled name. The **Call stack** and the History show short names [while stepping](#stepping), and the [memory view](#memory) shows the names of C++ data. The [Pseudocode](#pseudocode) writes names in their namespaces.

A name the demangler cannot read stays mangled. Examples include a few of libstdc++'s typeinfo names for the `_Float32x` and `_Float64x` types, some templates whose return type contains an expression, some of GCC's conversion operators to a type in a namespace, names over 8,192 characters, and Rust's newer `_R` names. If the demangler cannot be loaded, every name stays mangled. The demangler is LLVM's, whose text differs from that of GNU's `c++filt`, `objdump -C` and gdb in two ways: closing brackets have no space between them (`>>`), and a lambda reads `main::'lambda'(int)` where GNU writes `main::{lambda(int)#1}`.

While a C++ program compiled in the editor runs, its Call stack and History show mangled names; its Build output's Listing and Pseudocode show C++ names as described here.

## The Symbols panel {#symbols}

The **Symbols** panel, the tags icon in the rail, lists the functions and strings of an Executable: the one shown in the editor pane you used last, or else the project's Entry file when it is an Executable. The rail offers it only in a project that has an Executable. Choose **Functions** for each function's [name](#names), address and size in bytes, up to the next function, or **Strings** for each string the Listing labels, with its text and address. The addresses are the ones the program has when it runs, as in the Listing's gutter. If no pane shows the Listing yet, the panel generates it first. A C++ function's row shows its [short name](#cpp-names), or its signature where another function has the same short name; its tooltip gives the signature, address and size, then the mangled name.

Click a row to show its line in the Listing; a [Pseudocode](#decompile) beside the Listing follows it to that function. The row the Listing's cursor is in is marked. The filter box keeps the rows whose name or text contains what you type, or whose address contains it as hexadecimal digits, with or without `0x`. For a C++ function, the filter checks the mangled name, the short name and the signature, so both `operator+=` and `_ZNSolsEi` find rows. **Enter** shows the first row that matches, and the arrow keys move from the filter down through the rows.

## Decompile {#decompile}

**Decompile** shows a function of the Executable as **Pseudocode**: C-like text that Ghidra's decompiler produces from the function's machine code. Pseudocode helps you read the program. It is not the program's source and is not meant to compile: it uses the decompiler's own names and types, such as `iVar1` and `undefined8`, and can contain the decompiler's warnings.

The Pseudocode shows one function at a time: the function the Listing's cursor is in. The Listing stays beside it; if no pane shows the Listing, Decompile opens it in a second pane on the left, or above on a narrow screen. Move the Listing's cursor into another function to show that function's Pseudocode. A line outside any function, such as data, leaves the Pseudocode as it is. If the cursor is in no function, Decompile shows the function the program is in during a Debug session, and otherwise `main`, or the function at the entry point when no `main` is found.

Each Pseudocode line is linked to the instructions it came from. Linked lines share a colour in both panes, and selecting lines in one pane highlights the linked lines in the other. Some instructions, such as `endbr64` and `push rbp` at the start of a function, belong to no Pseudocode line.

Like the Listing, the Pseudocode is generated from the File's current bytes and is never saved; a [Byte edit](#byte-edits) makes the editor decompile the function again. The decompiler runs in your browser, so the Executable is not uploaded anywhere. The first Decompile loads the decompiler, which takes a moment. Decompile is not available for a shared library's Listing, such as `@lib/libc.so.6`.

## Reading the Pseudocode {#pseudocode}

The first line is a comment naming the function and the addresses of its first and last bytes, such as `// main, 0x5555555551e9 to 0x5555555552ba`; a C++ function is named as lists name it, such as `// game::Boss::~Boss() [deleting], …`. Functions and data have the names the [Listing](#names) gives them, invented ones included, so `FUN_brave_otter` and `DAT_misty_tanager` read the same in both panes. A call through `strcmp@plt` reads as a call of `strcmp`, a library variable the Listing names with its version, such as `stdin@GLIBC_2.2.5`, reads as `stdin`, and strings appear inline, as in `strcmp(acStack_98,"hunter2")`. The decompiler knows the parameter and return types of common C library functions, such as `printf`, `fgets` and `strcmp`, and the types of library variables such as `stdin`.

A C++ program's functions and data read with their namespaces and classes, as C++ writes them: in `main`, `std::string::operator+=(auStack_128,auStack_c8)` and `std::vector<std::string>::push_back(auStack_198,auStack_128)`. As in Ghidra, a name is qualified only as far as the place it is used needs: inside a member of `std::string`, a call of another member reads `max_size(…)`, and inside `game::Boss::Boss`, the call of its base class's constructor reads `Player::Player(param_1,param_2)`. A function's own declaration line always gives its whole name. Overloads read alike, such as `sum(auStack_178)` and `sum(auStack_198)` for two functions named `sum`; hover over one to see which it is.

Special data read as names filed under what they belong to: `std::runtime_error::typeinfo` for what the Listing calls `typeinfo for std::runtime_error`, and `greeting()::text::guard` for `guard variable for greeting()::text`, the flag that makes sure the static `text` in `greeting()` is initialised once. A lambda reads as part of the function it is written in: `main::'lambda'(int)::operator()`. A function's address read from its GOT slot ends in `@got`, as in `__cxa_throw(thrown_exception,std::runtime_error::typeinfo,std::runtime_error::~runtime_error@got)`. A constructor's store of its class's vtable reads as a number, `*param_1 = 0x555555562c20;`, because the address is 0x10 bytes into the vtable; the Listing's line for it says `vtable for game::Boss+0x10`.

The decompiler names everything else itself:

- Local variables by type and number: `iVar1` is an `int`, `pcVar2` a `char *`, `uVar3` a value of unsigned or unknown type. Parameters are `param_1`, `param_2`, …
- Stack variables by their offset in the stack frame, such as the array `acStack_98`.
- Types it cannot determine by their size: `undefined8` is 8 bytes and `undefined4` 4 bytes of unknown type.
- Values that reach the function other than through its parameters and return values, by where they come from: `in_FS_OFFSET` is where the FS segment starts, which holds the stack canary at `in_FS_OFFSET + 0x28`; `unaff_RBX` is `rbx` as the caller left it; `extraout_RAX` is a value a call left in `rax` although its prototype returns none there.

Hover over one of these words for a short explanation of it, with a link back to this section. A comment starting with `WARNING:` is a note from the decompiler about code it could not fully recover, such as a jump through a table. A name with an extra leading `_`, such as `_DAT_epic_cicada`, refers to more bytes than the Listing's label for that address covers.

Hover over a number for the card the [Listing](#listing) shows: its value in decimal, hexadecimal and binary, and a **Text** line when its bytes are printable. A constant written into a local variable is often part of a string built 8 bytes at a time: `0x4c75257240343a41` reads `A:4@r%uL`.

**Go to Definition**: press F12 on a called function or a data name, Ctrl+click it (Cmd+click on a Mac) or double-click it to show it in the Listing. For a called function, the Pseudocode then shows that function. Such a name is underlined while the pointer is over it. Hover over the name to see the Listing's name and address for it; for an [invented name](#names), the hover also says where the name comes from. For a [C++ name](#cpp-names), the hover gives its signature, the demangler's text, its short and mangled names and, for special data, how the Pseudocode writes it. A qualified name is one name: the hover, the double-click and Go to Definition work anywhere on `std::string::operator+=`. When the decompiler breaks a long name across two lines, only the part on the second line is linked.

The notice at the top right names the function shown. Its **?** opens this section in the Documentation panel, and the notice hides while Find (Ctrl+F) is open in the pane.

## When decompiling takes long {#decompile-time}

Most functions decompile in well under a second. A large function can take much longer: `printf_positional`, part of the C library in a statically linked program, takes 10 seconds or more. While the decompiler works, the pane shows **Decompiling…** with the function's name. For a large program, the pane first shows the progress of its Listing, which the decompiler needs.

The decompiler stops working on a function after 30 seconds. The pane then shows **No Pseudocode** with the reason, such as "printf_positional took longer than 30 seconds to decompile". **Try again** starts again; on a less busy device, the function may finish within the limit. A function the decompiler cannot handle shows **No Pseudocode** with the decompiler's reason.

## Back and forward {#navigation}

Each editor pane keeps a history of the places it jumped from in a Listing or a Pseudocode, as a browser keeps the pages you visited. A jump is a double-click on a name, **Go to Definition**, **Go to Symbol**, **Show in Listing** in the Hex editor or in the menu of a [register's value or a byte](#memory), or a row of the [Symbols panel](#symbols). **Alt+←** goes back and **Alt+→** forward, and so do the mouse's back and forward buttons over the pane and **Go Back** and **Go Forward** in its context menu. Outside the editor, in the Symbols panel for one, the keys and the buttons move the pane you worked in last, while it shows a Listing or a Pseudocode with somewhere to go; otherwise they are the browser's, and with unsaved changes the page asks before you leave it.

A place in the Listing is a line; a place in the Pseudocode is its function, and going back to one moves the Listing beside it into that function. A jump that moves both panes, such as following a call in the Pseudocode, leaves a place in each. A pane keeps up to 50 places behind it and 50 ahead, and skips a place that no longer exists, such as a library's Listing after the Debug session ends.

## Building and stepping {#stepping}

For an Executable, the dock's Build button reads **Debug**, since nothing is assembled; this chapter calls what it does a Build, as the Log does. It loads the Executable and runs its startup code, including the dynamic linker, toward the first instruction of detected `main`. When no `main` is found, the target is the executable entry point: the address recorded in the ELF file where program execution starts. This startup advance happens even when **Step into library code** is enabled.

While the Build works, the button says what it is waiting for: **Downloading libc.so.6…** for each [library](#libraries) not downloaded yet, **Loading the program…**, then **Starting the program…** during the startup advance. **Cancel** beside it ends the Build at once and returns to editing.

Startup can stop earlier at one of your Breakpoints. If the program asks for Terminal input, type an answer and press **Enter**; startup continues toward the target after receiving it. While the program waits for input, at startup or later, the Terminal is outlined in the accent colour with its question highlighted, and it takes the keyboard from the Listing, the Pseudocode and the locked Command line, though not from a text box you can type in, Find or a dialog. The first time the program writes or waits for input in a Debug session, the bottom panel grows to show about eight lines, unless you have resized it during that session. It does not shrink back. If the program ends on a signal or an error first, the editor shows where it stopped; if it exits, as a program missing a library does, no line is highlighted. After 50,000,000 startup instructions without reaching the target, execution pauses at the current instruction and the **Log** shows a warning. The loaded program remains available for inspection; use **Run** or **Step** to continue.

Instructions executed during Build's startup advance are outside Undo history. New steps are recorded from the point where Build stops.

By default, **Step** over a shared-library call such as `call printf@plt` runs the call and stops at the next program instruction. It stops earlier if the library calls back into your program, as when `qsort` calls your comparison function. History groups the library call into one row, such as "Called printf in libc.so.6". A C++ function reads by its [short name](#cpp-names), as in "Called std::ostream::operator<< in libstdc++.so.6", with its signature and mangled name in the row's tooltip. While it waits for input, the editor shows the call that led there, such as `call fgets@plt`.

To step through shared-library instructions, enable **Step into library code** in **Preferences**. For a statically linked Executable, the library code is already part of the Executable, so Step enters those functions like other program functions. Programs [compiled in the editor](/documentation/x86/runtime-library#stepping) use different startup handling: enabling this Preference begins their execution at `_start`.

A crash inside a library, such as invalid data reaching `strlen`, is shown on that library's instruction. The **Call stack** includes the program's own frames; choose a frame to see its line. A C++ frame shows its short name, or its signature where overloads share the short name, with the signature and mangled name in its tooltip.

When the program exits, the Listing and the Pseudocode stay where you were reading, and no line is highlighted. Its last instructions run in the C library, and the only line of its own code involved is `_start`'s call of `__libc_start_main`. A program that ends on a signal, such as a crash, is still shown where it stopped. **Undo** takes the last step back and shows its line again.

## Breakpoints {#breakpoints}

Click beside a Listing instruction to place a Breakpoint. **Run** stops before that instruction. A Breakpoint holds its address, so it stays on the instruction if the Listing's lines move. You can set Breakpoints on the Executable's instructions, but not on labels, data, or a library's Listing. You can also set them from the [Pseudocode](#pseudocode-debugging).

**Toggle Breakpoint** (F9) in a line's context menu sets or removes its Breakpoint too. In Edge, and in Firefox on Windows, the browser may also act on F9; the context menu avoids that. During a Debug session, **Run to Cursor** (Ctrl+F10, ⌘F10 on a Mac) runs until the program reaches the instruction on the cursor's line, as if a Breakpoint were there for this Run only. It still stops earlier at any of your Breakpoints, and the program's end stops it too. Run to Cursor from the line the program is stopped on runs until the program comes back to that instruction. It is offered only on the running program's own Listing and Pseudocode, while the program is stopped and not waiting for input.

To inspect the inputs to a library function, stop on its `call` instruction. Integer and pointer arguments in the x86-64 function calling convention use `rdi`, `rsi`, `rdx`, `rcx`, `r8`, and `r9`. For example, at `call strcmp@plt`, `rdi` and `rsi` hold the addresses of the strings to compare.

## Debugging in the Pseudocode {#pseudocode-debugging}

During a Debug session, a pane showing the Pseudocode stays on it. The Pseudocode shows the function the program is in and highlights the line the current instruction belongs to. An instruction that belongs to no line, such as `endbr64`, highlights no line; the Listing beside it always shows the instruction.

Click beside a Pseudocode line to set a Breakpoint on it. The editor places a Breakpoint on the first instruction of each block of instructions the line came from. These are ordinary Breakpoints of the Listing, which shows them too. For example, in crackme, a Breakpoint on `if (iVar1 == 0) {` goes on `test eax, eax`, so **Run** stops after `strcmp` returns and before the program branches. A Pseudocode line is marked when any of its instructions has a Breakpoint, wherever you set it. Clicking the mark removes all of those Breakpoints, and removing them in the Listing removes the mark. Lines without instructions, such as declarations and braces, take none. **Toggle Breakpoint** and **Run to Cursor** in a Pseudocode line's context menu follow the same rule: Run to Cursor stops at the first of those instructions the program reaches.

The Breakpoints belong to instructions, not to the text: they stay where they are when the Pseudocode is generated again, for example after a Byte edit. The Pseudocode of a [Build output](#build-output) takes no Breakpoints and highlights no line, like its Listing.

## Addresses in registers and memory {#memory}

During a Debug session, the memory view's address box takes the Listing's [names](#names) as well as addresses: `main`, `FUN_brave_otter`, `DAT_misty_tanager`, `s_Enter_password` or `strcmp@plt`, and an offset after one, as in `DAT_misty_tanager+8`. Each goes to the address the name has while the program runs. A `.LAB_` name is not taken, since it names a place only inside its function. The `0x` before the box shows only while it holds a number.

In a C++ program, the box also takes [C++ names](#cpp-names). It takes a function's short name or signature when no other function has the same one, such as `sum(std::vector<int> const&)` but not `sum`, which names two functions. It takes data by the name the memory view shows, including any version suffix: `std::cout@GLIBCXX_3.4` works, `std::cout` alone does not. The memory view's list of regions and data, and its hover over a byte, name C++ data this way and add the mangled name: the hover names `std::cout@GLIBCXX_3.4 (_ZSt4cout@GLIBCXX_3.4)`, and the list gives the mangled name in the row's tooltip.

Right-click a register's value, the program counter's included, or a byte in the memory view for a menu that reads the value as an address:

- **Show in memory** moves the memory view to the address and rings its byte until you move the view yourself.
- **Show in Listing** shows the instruction at the address, when it is in the Executable's own code rather than a library's.
- **Copy as hex** and **Copy as decimal** copy the value.

A byte's menu also has **Follow pointer**, which reads the 8 bytes there as an address, least significant byte first as x86-64 stores a pointer, and shows that address in the memory view. Right-click inside a selection of bytes to use the number they make together; **Follow pointer** then reads from the selection's first byte. A click on a value still edits it.

The **»** button at the end of the memory view's controls collapses the registers and memory to a narrow strip at the right edge, which leaves the editor more room; dragging the splitter beside them far to the right does the same. Click the strip to open them again at the width they had. The choice is kept with your layout.

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

When **Build** assembles your program, including one compiled from C or C++, it links a Linux executable, as `nasm` and `ld` would. The **Explorer** lists it under **Build output**, at the name the [Command line](#arguments) runs it as: the Entry path without its extension, so `main.asm` gives `main` and a program compiled from `src/main.c` gives `src/main`. It opens like an imported Executable, on Disassemble with Hex and Decompile beside it, and it is read-only. Its Listing and Pseudocode take no Breakpoints; the debugger follows the program in your source. While Build works, its button says what it is doing, such as **Downloading the assembler…** the first time, **Assembling…** and **Linking…**, and **Cancel** ends it as it ends [an Executable's](#stepping). A Build started right after a Cancel may first say **Waiting for the cancelled Build to end…**, for up to 20 seconds while an unfinished download of the assembler gives up.

The running program finds it in its working directory: it can open `./main` and read its bytes, but writing it fails with `ETXTBSY`, and renaming or deleting it fails with `EBUSY`. Each Testcase's program finds its own copy.

Each Build replaces the Build output, and it is never saved with the project, archived or shared. Once you change a File it was built from, the Entry file, or a project Setting the Build uses, the Explorer dims it and marks it **From an earlier Build** until the next Build. **Download** saves it to run on an x86-64 Linux machine. **Keep as File** copies it into the project as an Executable under a name you choose, which no File may have already.

If a File or folder of the project already has the Build output's path, the Build output is not shown, and the **Log** says so: "`main` is already a File of the Project, so the built program is not shown; rename one of them." An Executable Entry has no Build output, since it is a File of the project already.

## Log notes {#log-notes}

The **Log** reports unsupported operations once per run:

- An unimplemented system call: "`getcpu` (syscall 309) is not implemented; the call returned ENOSYS". The program receives `ENOSYS`, Linux's error for an unavailable call.
- An unsupported instruction: "The program ran `aesenc xmm0, xmm1` at `0x555555555195`, which the emulator does not support". Execution ends with `SIGILL`, the illegal-instruction signal. The Listing still decodes the instruction. [Vector instructions](/documentation/x86/vector-instructions) lists the extensions that run.
- An AVX-512 instruction: "The program ran `vaddps zmm0, zmm1, zmm2` at `0x555555555195`. AVX-512 instructions are not currently supported." The run's line in the Log ends with the same sentence instead of "Illegal instruction (signal 4)". Nothing warns before a run, because a program can contain AVX-512 code it never reaches: glibc chooses its functions by what the processor reports.
- A library that is not bundled: "libcrypto.so.3 is not one of the bundled libraries".
- Startup that reaches the 50,000,000-instruction budget. Execution pauses and remains inspectable, as described under [Building and stepping](#stepping).

## Safety {#safety}

The program runs in an emulator inside the browser's sandbox, and the Listing and the Pseudocode are made in the browser too. Its file access is limited to project Files and bundled libraries, and it has no network access. Breakpoints do not modify program bytes, and `ptrace(PTRACE_TRACEME)` succeeds as it does when no debugger is attached. Timing checks still see real time, so pausing or stepping can change their results.

A share link stores the project in its URL, which most Executables are too large for. Download the project as an archive from the Projects page to share it instead.
